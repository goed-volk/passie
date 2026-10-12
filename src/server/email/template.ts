import { t } from "../../i18n/t";
import type { EmailPayload } from "./types";

export function renderOtpEmail(to: string, otp: string): EmailPayload {
  const subject = t("emailOtpSubject");
  const text = t("emailOtpBodyText", { code: otp });

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 24px; color: #18181b;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7;">
    <h1 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: #09090b;">
      ${t("emailOtpBodyHtmlTitle")}
    </h1>
    <p style="font-size: 15px; line-height: 1.5; color: #3f3f46; margin-bottom: 24px;">
      ${t("emailOtpBodyHtmlDesc")}
    </p>
    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #09090b;">
        ${otp}
      </span>
    </div>
    <p style="font-size: 13px; line-height: 1.5; color: #71717a; margin-bottom: 8px;">
      ${t("emailOtpBodyHtmlExpiry")}
    </p>
    <p style="font-size: 13px; line-height: 1.5; color: #a1a1aa; margin-top: 0; margin-bottom: 0;">
      ${t("emailOtpBodyHtmlIgnore")}
    </p>
  </div>
</body>
</html>`;

  return { to, subject, html, text };
}
