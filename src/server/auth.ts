import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { emailOTP } from "better-auth/plugins/email-otp";
import { passkey } from "@better-auth/passkey";
import { nextCookies } from "better-auth/next-js";
import { testUtils } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import * as authSchema from "./authSchema";
import { getMailer, renderOtpEmail } from "./email";
import { createDb, type DbClient } from "./db";

import type { BetterAuthPlugin } from "better-auth";

export interface AuthContextOptions {
  db?: DbClient;
  env?: Record<string, unknown>;
  cfCtx?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } };
}

export async function getAuth(options?: AuthContextOptions) {
  let env = options?.env;
  let db = options?.db;
  let cfCtx = options?.cfCtx;

  if (!env || !db) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const resolved = await getCloudflareContext({ async: true });
      env = env ?? (resolved.env as unknown as Record<string, unknown>);
      cfCtx = cfCtx ?? resolved;
      if (!db && resolved.env?.DB) {
        db = createDb(resolved.env.DB);
      }
    } catch {
      // In vitest or script environment where getCloudflareContext is not available
    }
  }

  if (!db) {
    throw new Error("[getAuth] Database client is required to initialize auth");
  }

  const passieEnv = (env?.PASSIE_ENV as string | undefined) || process.env.PASSIE_ENV || "development";
  const isProduction = passieEnv === "production";
  const isDevLoginEnabled =
    !isProduction &&
    ((env?.PASSIE_DEV_LOGIN || process.env.PASSIE_DEV_LOGIN) === "1" || process.env.NODE_ENV === "test");

  const secret =
    (env?.BETTER_AUTH_SECRET as string | undefined) ||
    process.env.BETTER_AUTH_SECRET ||
    (!isProduction ? "local-dev-better-auth-secret-min-32-characters-change-in-prod" : undefined);

  const publicOrigin =
    (env?.PASSIE_PUBLIC_ORIGIN as string | undefined) ||
    process.env.PASSIE_PUBLIC_ORIGIN ||
    (!isProduction ? "http://localhost:3000" : undefined);

  if (isProduction) {
    if (!secret || secret === "local-dev-better-auth-secret-min-32-characters-change-in-prod") {
      throw new Error("[auth] Missing or default BETTER_AUTH_SECRET configured in production");
    }
    if (!publicOrigin) {
      throw new Error("[auth] Missing PASSIE_PUBLIC_ORIGIN in production");
    }
  }

  const effectiveOrigin = publicOrigin || "http://localhost:3000";
  const url = new URL(effectiveOrigin);
  const rpID = url.hostname;
  const origin = url.origin;

  const rawTrustedOrigins =
    (env?.BETTER_AUTH_TRUSTED_ORIGINS as string | undefined) ||
    process.env.BETTER_AUTH_TRUSTED_ORIGINS;

  const configuredOrigins = rawTrustedOrigins
    ? rawTrustedOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : (!isProduction
        ? ["http://localhost:*", "http://127.0.0.1:*"]
        : []);

  const trustedOrigins = Array.from(new Set([origin, ...configuredOrigins]));

  const plugins: BetterAuthPlugin[] = [
    emailOTP({
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 600, // 10 minutes
      allowedAttempts: 3,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp }) => {
        const mailer = getMailer(env);
        const payload = renderOtpEmail(email, otp);
        const sendPromise = mailer.send(payload).catch((err) => {
          const domain = email.includes("@") ? `@${email.split("@")[1]}` : "unknown";
          console.error(`[auth:emailOTP] Failed to send verification OTP to domain ${domain}:`, err instanceof Error ? err.message : String(err));
        });

        if (cfCtx?.ctx?.waitUntil) {
          cfCtx.ctx.waitUntil(sendPromise);
        } else {
          await sendPromise;
        }
      },
    }),
    passkey({
      rpID,
      rpName: "Passie",
      ...(isProduction ? { origin } : {}),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      schema: {
        passkey: {
          modelName: "auth_passkey",
        },
      },
    }),
  ];

  if (isDevLoginEnabled) {
    plugins.push(testUtils({ captureOTP: true }));
  }

  // nextCookies must always be last per Better Auth docs
  plugins.push(nextCookies());

  const activeDb = db;

  return betterAuth({
    baseURL: origin,
    secret,
    database: drizzleAdapter(activeDb, {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    trustedOrigins,
    emailAndPassword: { enabled: false },
    socialProviders: {},
    account: { accountLinking: { enabled: false } },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      modelName: "auth_user",
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
        banned: { type: "boolean", defaultValue: false, input: false },
      },
      validateUserInfo: ({ source }) => {
        if (source?.action === "create-user") {
          throw new APIError("FORBIDDEN", { message: "Public sign-up is disabled" });
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            throw new APIError("FORBIDDEN", { message: "Public sign-up is disabled" });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await activeDb.query.auth_user.findFirst({
              where: eq(authSchema.auth_user.id, session.userId),
            });
            if (user?.banned) {
              throw new APIError("FORBIDDEN", { message: "Account is suspended" });
            }
          },
        },
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 86400, // 60 days
      updateAge: 86400, // 1 day sliding
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "passie",
      useSecureCookies: isProduction,
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    rateLimit: {
      enabled: process.env.NODE_ENV !== "test",
      storage: "database",
      modelName: "auth_rate_limit",
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 5 },
      },
    },
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/sign-in/social",
      "/request-password-reset",
      "/reset-password",
      "/verify-password",
      "/change-password",
      "/set-password",
      "/send-verification-email",
      "/verify-email",
      "/change-email",
      "/update-user",
      "/update-session",
      "/delete-user",
      "/delete-user/callback",
      "/list-accounts",
      "/link-social",
      "/unlink-account",
      "/refresh-token",
      "/get-access-token",
      "/account-info",
      "/email-otp/verify-email",
      "/email-otp/check-verification-otp",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
      "/forget-password/email-otp",
      "/email-otp/request-email-change",
      "/email-otp/change-email",
    ],
    plugins,
  });
}

export type AuthInstance = Awaited<ReturnType<typeof getAuth>>;
