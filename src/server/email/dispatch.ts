import { and, eq } from "drizzle-orm";
import * as authSchema from "../authSchema";
import * as schema from "../schema";
import type { DbClient } from "../db";
import { captureServerException, captureServerTelemetryEvent } from "../telemetryConfig";
import { CloudflareMailer } from "./cloudflare";
import { getMailer } from "./index";
import type { EmailKind, EmailPayload, EmailTrigger } from "./types";

const PII_PROPERTY_DENYLIST = new Set([
  "to",
  "email",
  "recipient",
  "otp",
  "code",
  "token",
  "secret",
  "name",
  "displayname",
]);

export function resolvePublicOrigin(env?: Record<string, unknown>): string {
  const raw =
    (typeof env?.PASSIE_PUBLIC_ORIGIN === "string" && env.PASSIE_PUBLIC_ORIGIN.trim() !== ""
      ? env.PASSIE_PUBLIC_ORIGIN.trim()
      : null) ||
    (process.env.PASSIE_PUBLIC_ORIGIN && process.env.PASSIE_PUBLIC_ORIGIN.trim() !== ""
      ? process.env.PASSIE_PUBLIC_ORIGIN.trim()
      : null) ||
    "https://passie.goedvolk.org";

  return raw.replace(/\/+$/, "");
}

export interface DispatchTransactionalEmailOptions {
  payload: EmailPayload;
  kind: EmailKind;
  trigger?: EmailTrigger;
  memberId?: string | null;
  db?: DbClient;
  env?: Record<string, unknown>;
  cfCtx?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } };
  blocking?: boolean;
  extraProperties?: Record<string, unknown>;
}

function scrubExtraProperties(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return {};
  const scrubbed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (!PII_PROPERTY_DENYLIST.has(k.toLowerCase())) {
      scrubbed[k] = v;
    }
  }
  return scrubbed;
}

export async function dispatchTransactionalEmail(
  options: DispatchTransactionalEmailOptions
): Promise<void> {
  let env = options.env;
  let cfCtx = options.cfCtx;

  if (!env || !cfCtx) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const resolved = await getCloudflareContext({ async: true });
      env = env ?? (resolved.env as unknown as Record<string, unknown>);
      cfCtx = cfCtx ?? resolved;
    } catch {
      // Outside Cloudflare request context (vitest, CLI scripts)
    }
  }

  const mailer = getMailer(env);
  const provider = mailer instanceof CloudflareMailer ? "cloudflare" : "console";
  const sanitizedExtra = scrubExtraProperties(options.extraProperties);

  const resolveRecipientMemberId = async (): Promise<string | null> => {
    if (options.memberId) {
      return options.memberId;
    }
    if (!options.db) {
      return null;
    }
    try {
      const normalizedEmail = options.payload.to.trim().toLowerCase();
      const user = await options.db.query.auth_user.findFirst({
        where: eq(authSchema.auth_user.email, normalizedEmail),
      });
      if (!user) return null;
      const member = await options.db.query.members.findFirst({
        where: and(
          eq(schema.members.userId, user.id),
          eq(schema.members.isActive, 1)
        ),
      });
      return member?.id ?? null;
    } catch {
      return null;
    }
  };

  const sendPromise = (async () => {
    const resolvedMemberId = await resolveRecipientMemberId();
    const distinctId = resolvedMemberId ?? "system_mailer";
    const processPersonProfile = Boolean(resolvedMemberId);

    const baseProperties: Record<string, unknown> = {
      kind: options.kind,
      provider,
      ...(options.trigger ? { trigger: options.trigger } : {}),
      $process_person_profile: processPersonProfile,
      ...sanitizedExtra,
    };

    try {
      const res = await mailer.send(options.payload);
      if (mailer instanceof CloudflareMailer) {
        console.log(
          `[email:cloudflare] Sent ${options.kind} email (trigger=${options.trigger ?? "none"}, messageId=${res?.messageId ?? "n/a"})`
        );
      }
      await captureServerTelemetryEvent({
        event: "email.sent",
        distinctId,
        env,
        waitUntil: cfCtx?.ctx?.waitUntil?.bind(cfCtx.ctx),
        properties: baseProperties,
      });
    } catch (err) {
      const email = options.payload.to;
      const domain = email.includes("@") ? `@${email.split("@")[1]}` : "unknown";
      console.error(
        `[email:dispatch] Failed to send ${options.kind} email to domain ${domain}:`,
        err instanceof Error ? err.message : String(err)
      );
      await captureServerTelemetryEvent({
        event: "email.send_failed",
        distinctId,
        env,
        waitUntil: cfCtx?.ctx?.waitUntil?.bind(cfCtx.ctx),
        properties: baseProperties,
      });
      await captureServerException({
        error: err,
        distinctId,
        env,
        waitUntil: cfCtx?.ctx?.waitUntil?.bind(cfCtx.ctx),
        context: {
          source: "email_dispatch",
          kind: options.kind,
          ...(options.trigger ? { trigger: options.trigger } : {}),
          provider,
        },
      });
    }
  })();

  if (!options.blocking && cfCtx?.ctx?.waitUntil) {
    cfCtx.ctx.waitUntil(sendPromise);
  } else {
    await sendPromise;
  }
}
