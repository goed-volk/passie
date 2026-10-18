import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getAuth } from "../auth";
import { setBanned, preCreateUserAndLink } from "../authAdmin";
import { ConsoleMailer, CloudflareMailer, getMailer, renderOtpEmail } from "../email";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";

describe("Better Auth core, guards, disabledPaths & mailer tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    if (proxy) {
      await proxy.dispose();
    }
  });

  it("disabledPaths: unused core and email-otp paths return 404", async () => {
    const auth = await getAuth({ db });

    const disabledPathsToTest = [
      "/sign-up/email",
      "/sign-in/email",
      "/sign-in/social",
      "/request-password-reset",
      "/reset-password",
      "/verify-password",
      "/change-password",
      "/send-verification-email",
      "/verify-email",
      "/change-email",
      "/update-user",
      "/delete-user",
      "/email-otp/verify-email",
      "/email-otp/check-verification-otp",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
    ];

    for (const p of disabledPathsToTest) {
      const req = new Request(`http://localhost:3000/api/auth${p}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
      const res = await auth.handler(req);
      expect(res.status, `Expected 404 for disabled path ${p}`).toBe(404);
    }
  });

  it("reachable paths: /api/auth/ok responds with 200", async () => {
    const auth = await getAuth({ db });
    const req = new Request("http://localhost:3000/api/auth/ok");
    const res = await auth.handler(req);
    expect(res.status).toBe(200);
  });

  it("guards: databaseHooks reject direct user creation through adapter", async () => {
    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      internalAdapter: { createUser: (opts: { email: string; name: string }) => Promise<unknown> };
    };

    await expect(
      ctx.internalAdapter.createUser({
        email: "unauthorized@example.com",
        name: "Hacker",
      })
    ).rejects.toThrow();
  });

  it("setBanned: bans user and revokes all active sessions atomically", async () => {
    const testUserId = `user_ban_test_${Date.now()}`;
    const now = new Date();

    await db.insert(schema.auth_user).values({
      id: testUserId,
      email: `${testUserId}@example.com`,
      name: "Banned User",
      emailVerified: true,
      role: "user",
      banned: false,
      createdAt: now,
      updatedAt: now,
    });

    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      test: { login: (opts: { userId: string }) => Promise<unknown> };
    };
    await ctx.test.login({ userId: testUserId });

    const sessionsBefore = await db.query.auth_session.findMany({
      where: eq(schema.auth_session.userId, testUserId),
    });
    expect(sessionsBefore.length).toBeGreaterThan(0);

    // Ban user
    await setBanned(db, testUserId, true);

    const userAfter = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.id, testUserId),
    });
    expect(userAfter?.banned).toBe(true);

    const sessionsAfter = await db.query.auth_session.findMany({
      where: eq(schema.auth_session.userId, testUserId),
    });
    expect(sessionsAfter.length).toBe(0);

    // Trying to create a new session for a banned user throws
    await expect(ctx.test.login({ userId: testUserId })).rejects.toThrow(
      "Account is suspended"
    );
  });

  it("mailers: ConsoleMailer logs and captures payload; CloudflareMailer delegates to binding", async () => {
    const consoleMailer = new ConsoleMailer();
    const payload = renderOtpEmail("test@example.com", "123456");

    expect(payload.to).toBe("test@example.com");
    expect(payload.text).toContain("123456");
    expect(payload.html).toContain("123456");

    await consoleMailer.send(payload);
    expect(consoleMailer.getLastPayload()).toEqual(payload);

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const cfMailer = new CloudflareMailer({ send: mockSend }, "inloggen@passie.goedvolk.org");
    await cfMailer.send(payload);

    expect(mockSend).toHaveBeenCalledWith({
      to: "test@example.com",
      from: { name: "Passie", email: "inloggen@passie.goedvolk.org" },
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  });

  it("dev login: /api/dev/login-as creates valid session and returns cookies for member", async () => {
    const { handleDevLogin } = await import("../../app/api/dev/login-as/route");

    const req = new Request("http://127.0.0.1:3000/api/dev/login-as", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberSlug: "sam" }),
    });

    const res = await handleDevLogin(req, db);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      ok: boolean;
      member: { slug: string };
      cookie: string;
    };
    expect(data.ok).toBe(true);
    expect(data.member.slug).toBe("sam");
    expect(data.cookie).toBeDefined();
    expect(data.cookie).toContain("passie.session_token=");
  });

  it("trustedOrigins: dynamic localhost ports are accepted and untrusted origins return 403", async () => {
    const auth = await getAuth({
      db,
      env: {
        PASSIE_ENV: "development",
        BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:*,http://127.0.0.1:*",
      },
    });

    // Request from a non-3000 localhost port
    const validDevReq = new Request("http://localhost:3467/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3467",
        Host: "localhost:3467",
      },
      body: JSON.stringify({ email: "demo@goedvolk.org", type: "sign-in" }),
    });
    const validRes = await auth.handler(validDevReq);
    expect(validRes.status).toBe(200);

    // Request from an untrusted external origin
    const untrustedReq = new Request("http://localhost:3467/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://malicious-attacker.com",
        Host: "localhost:3467",
      },
      body: JSON.stringify({ email: "demo@goedvolk.org", type: "sign-in" }),
    });
    const untrustedRes = await auth.handler(untrustedReq);
    expect(untrustedRes.status).toBe(403);
    const errBody = (await untrustedRes.json()) as { code: string };
    expect(errBody.code).toBe("INVALID_ORIGIN");
  });

  it("fail-closed posture: getAuth rejects missing secret or origin in production", async () => {
    // Missing secret in production
    await expect(
      getAuth({
        db,
        env: {
          PASSIE_ENV: "production",
          PASSIE_PUBLIC_ORIGIN: "https://passie.goedvolk.org",
        },
      })
    ).rejects.toThrow("Missing or default BETTER_AUTH_SECRET configured in production");

    // Default dev secret in production
    await expect(
      getAuth({
        db,
        env: {
          PASSIE_ENV: "production",
          BETTER_AUTH_SECRET: "local-dev-better-auth-secret-min-32-characters-change-in-prod",
          PASSIE_PUBLIC_ORIGIN: "https://passie.goedvolk.org",
        },
      })
    ).rejects.toThrow("Missing or default BETTER_AUTH_SECRET configured in production");

    // Missing origin in production
    await expect(
      getAuth({
        db,
        env: {
          PASSIE_ENV: "production",
          BETTER_AUTH_SECRET: "production-super-secret-key-32-chars-minimum",
        },
      })
    ).rejects.toThrow("Missing PASSIE_PUBLIC_ORIGIN in production");
  });

  it("fail-closed posture: getMailer enforces Cloudflare binding in production", () => {
    // Disallows console mailer in production
    expect(() =>
      getMailer({
        PASSIE_ENV: "production",
        PASSIE_MAILER: "console",
      })
    ).toThrow("Cloudflare EMAIL binding is required and must be available in production");

    // Disallows missing EMAIL binding in production
    expect(() =>
      getMailer({
        PASSIE_ENV: "production",
        PASSIE_MAILER: "cloudflare",
      })
    ).toThrow("Cloudflare EMAIL binding is required and must be available in production");

    // Succeeds when binding is present
    const mockBinding = { send: vi.fn() };
    const mailer = getMailer({
      PASSIE_ENV: "production",
      PASSIE_MAILER: "cloudflare",
      EMAIL: mockBinding,
    });
    expect(mailer).toBeInstanceOf(CloudflareMailer);
  });

  it("fail-closed posture: getAuth rejects missing secret or origin in staging", async () => {
    // Missing secret in staging
    await expect(
      getAuth({
        db,
        env: {
          PASSIE_ENV: "staging",
          PASSIE_PUBLIC_ORIGIN: "https://passie-dev.goedvolk.org",
        },
      })
    ).rejects.toThrow("Missing or default BETTER_AUTH_SECRET configured in staging");

    // Default dev secret in staging
    await expect(
      getAuth({
        db,
        env: {
          PASSIE_ENV: "staging",
          BETTER_AUTH_SECRET: "local-dev-better-auth-secret-min-32-characters-change-in-prod",
          PASSIE_PUBLIC_ORIGIN: "https://passie-dev.goedvolk.org",
        },
      })
    ).rejects.toThrow("Missing or default BETTER_AUTH_SECRET configured in staging");

    // Missing origin in staging
    await expect(
      getAuth({
        db,
        env: {
          PASSIE_ENV: "staging",
          BETTER_AUTH_SECRET: "staging-super-secret-key-32-chars-minimum",
        },
      })
    ).rejects.toThrow("Missing PASSIE_PUBLIC_ORIGIN in staging");
  });

  it("fail-closed posture: getMailer enforces Cloudflare binding in staging", () => {
    expect(() =>
      getMailer({
        PASSIE_ENV: "staging",
        PASSIE_MAILER: "console",
      })
    ).toThrow("Cloudflare EMAIL binding is required and must be available in staging");

    expect(() =>
      getMailer({
        PASSIE_ENV: "staging",
        PASSIE_MAILER: "cloudflare",
      })
    ).toThrow("Cloudflare EMAIL binding is required and must be available in staging");

    const mockBinding = { send: vi.fn() };
    const mailer = getMailer({
      PASSIE_ENV: "staging",
      PASSIE_MAILER: "cloudflare",
      EMAIL: mockBinding,
    });
    expect(mailer).toBeInstanceOf(CloudflareMailer);
  });

  it("staging configuration: getAuth initializes with secure cookies and staging origin", async () => {
    const auth = await getAuth({
      db,
      env: {
        PASSIE_ENV: "staging",
        BETTER_AUTH_SECRET: "staging-super-secret-key-32-chars-minimum",
        PASSIE_PUBLIC_ORIGIN: "https://passie-dev.goedvolk.org",
        BETTER_AUTH_TRUSTED_ORIGINS: "https://passie-dev.goedvolk.org",
      },
    });
    expect(auth.options.baseURL).toBe("https://passie-dev.goedvolk.org");
    expect(auth.options.advanced?.useSecureCookies).toBe(true);
  });

  it("dev login: /api/dev/login-as returns 404 in staging environment", async () => {
    const { handleDevLogin } = await import("../../app/api/dev/login-as/route");
    const originalEnv = process.env.PASSIE_ENV;
    try {
      process.env.PASSIE_ENV = "staging";
      const req = new Request("http://localhost:3000/api/dev/login-as", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memberSlug: "sam" }),
      });
      const res = await handleDevLogin(req, db);
      expect(res.status).toBe(404);
    } finally {
      if (originalEnv !== undefined) {
        process.env.PASSIE_ENV = originalEnv;
      } else {
        delete (process.env as Record<string, string | undefined>).PASSIE_ENV;
      }
    }
  });

  it("email OTP telemetry: emits email.sent with member distinctId and $geoip_disable on OTP send", async () => {
    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = global.fetch;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("/capture/")) {
        fetchCalls.push({
          url: urlStr,
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ status: 1 }), { status: 200 });
      }
      return originalFetch(input as RequestInfo, init);
    });

    try {
      const member = await db.query.members.findFirst({
        where: eq(schema.members.slug, "sam"),
      });
      expect(member).toBeDefined();
      const otpEmail = "sam-otp-telemetry@goedvolk.org";
      await preCreateUserAndLink(db, {
        email: otpEmail,
        name: "Sam",
        memberId: member!.id,
      });

      const auth = await getAuth({
        db,
        env: {
          PASSIE_ENV: "development",
          POSTHOG_KEY: "phc_test_otp_key",
          POSTHOG_HOST: "https://eu.i.posthog.com",
        },
      });

      const req = new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          Host: "localhost:3000",
        },
        body: JSON.stringify({ email: otpEmail, type: "sign-in" }),
      });

      const res = await auth.handler(req);
      expect(res.status).toBe(200);

      expect(fetchCalls.length).toBe(1);
      const captured = fetchCalls[0]!;
      expect(captured.url).toBe("https://eu.i.posthog.com/capture/");
      expect(captured.body.event).toBe("email.sent");
      expect(captured.body.distinct_id).toBe(member!.id);
      expect(captured.body.properties).toEqual(
        expect.objectContaining({
          kind: "otp",
          otp_type: "sign-in",
          provider: "console",
          $geoip_disable: true,
          $process_person_profile: true,
        })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("logger error telemetry: untrusted origin (e.g. http://passie.goedvolk.org) triggers Better Auth error logger and dispatches sanitized $exception to PostHog", async () => {
    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const waitUntilPromises: Array<Promise<unknown>> = [];
    const originalFetch = global.fetch;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("/capture/")) {
        fetchCalls.push({
          url: urlStr,
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ status: 1 }), { status: 200 });
      }
      return originalFetch(input as RequestInfo, init);
    });

    try {
      const auth = await getAuth({
        db,
        env: {
          PASSIE_ENV: "development",
          PASSIE_PUBLIC_ORIGIN: "https://passie.goedvolk.org",
          BETTER_AUTH_TRUSTED_ORIGINS: "https://passie.goedvolk.org",
          POSTHOG_KEY: "phc_test_logger_key",
          POSTHOG_HOST: "https://eu.i.posthog.com",
        },
        cfCtx: {
          ctx: {
            waitUntil: (p) => {
              waitUntilPromises.push(p);
            },
          },
        },
      });

      const untrustedHttpReq = new Request(
        "https://passie.goedvolk.org/api/auth/email-otp/send-verification-otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://passie.goedvolk.org",
            Host: "passie.goedvolk.org",
          },
          body: JSON.stringify({ email: "demo@goedvolk.org", type: "sign-in" }),
        }
      );

      const res = await auth.handler(untrustedHttpReq);
      expect(res.status).toBe(403);
      await Promise.all(waitUntilPromises);

      expect(fetchCalls.length).toBe(1);
      const captured = fetchCalls[0]!;
      expect(captured.url).toBe("https://eu.i.posthog.com/capture/");
      expect(captured.body.event).toBe("$exception");
      expect(captured.body.distinct_id).toBe("system_auth");
      expect(captured.body.properties).toEqual(
        expect.objectContaining({
          source: "better_auth_logger",
          $geoip_disable: true,
          $process_person_profile: false,
          $exception_message: expect.stringContaining("Invalid origin: http://passie.goedvolk.org"),
          detail: expect.stringContaining("Invalid origin: http://passie.goedvolk.org"),
        })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
