import type { Mailer } from "./types";
import { ConsoleMailer } from "./console";
import { CloudflareMailer, type CloudflareSendEmailBinding } from "./cloudflare";

export * from "./types";
export * from "./console";
export * from "./cloudflare";
export * from "./template";
export * from "./dispatch";
export * from "./lifecycle";

const defaultConsoleMailer = new ConsoleMailer();

export function getMailer(env?: Record<string, unknown>): Mailer {
  const emailBinding = env?.EMAIL as CloudflareSendEmailBinding | undefined;
  const isBindingAvailable = Boolean(emailBinding && typeof emailBinding.send === "function");
  const isProduction = (env?.PASSIE_ENV || process.env.PASSIE_ENV) === "production";

  const configuredMailer = (
    (env?.PASSIE_MAILER as string | undefined) ||
    process.env.PASSIE_MAILER ||
    (isProduction && isBindingAvailable ? "cloudflare" : "console")
  ).toLowerCase();

  if (isProduction) {
    if (configuredMailer !== "cloudflare" || !isBindingAvailable) {
      throw new Error("[mailer] Cloudflare EMAIL binding is required and must be available in production");
    }
  }

  if (configuredMailer === "cloudflare") {
    if (!isBindingAvailable) {
      console.warn("[mailer] Cloudflare EMAIL binding not found on env, falling back to console mailer");
      return defaultConsoleMailer;
    }
    const fromAddress =
      (env?.PASSIE_MAIL_FROM as string | undefined) ||
      process.env.PASSIE_MAIL_FROM ||
      "inloggen@passie.goedvolk.org";
    return new CloudflareMailer(emailBinding!, fromAddress);
  }

  return defaultConsoleMailer;
}
