import type { Mailer } from "./types";
import { ConsoleMailer } from "./console";
import { CloudflareMailer, type CloudflareSendEmailBinding } from "./cloudflare";
import { isCloudDeployed, resolvePassieEnv } from "../env";

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
  const isCloud = isCloudDeployed(env);
  const passieEnv = resolvePassieEnv(env);

  const configuredMailer = (
    (env?.PASSIE_MAILER as string | undefined) ||
    process.env.PASSIE_MAILER ||
    (isCloud && isBindingAvailable ? "cloudflare" : "console")
  ).toLowerCase();

  if (isCloud) {
    if (configuredMailer !== "cloudflare" || !isBindingAvailable) {
      throw new Error(`[mailer] Cloudflare EMAIL binding is required and must be available in ${passieEnv}`);
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
