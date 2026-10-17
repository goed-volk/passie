import { t } from "../../i18n/t";
import type { EmailPayload } from "./types";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PassieEmailLayoutOptions {
  subject: string;
  preheader: string;
  title: string;
  greeting?: string;
  leadText: string;
  bodyHtml?: string;
  calloutBoxHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  helperText?: string;
  ignoreNotice?: string;
  groupBadge?: string;
}

export function renderPassieEmailLayout(options: PassieEmailLayoutOptions): string {
  const safeSubject = escapeHtml(options.subject);
  const safePreheader = escapeHtml(options.preheader);
  const safeTitle = escapeHtml(options.title);
  const safeGreeting = options.greeting ? escapeHtml(options.greeting) : null;
  const safeLead = escapeHtml(options.leadText);
  const safeGroupBadge = options.groupBadge ? escapeHtml(options.groupBadge) : null;
  const safeHelperText = options.helperText ? escapeHtml(options.helperText) : null;
  const safeIgnoreNotice = options.ignoreNotice ? escapeHtml(options.ignoreNotice) : null;
  const safeCtaLabel = options.ctaLabel ? escapeHtml(options.ctaLabel) : null;
  const safeCtaUrl = options.ctaUrl ? escapeHtml(options.ctaUrl) : null;
  const safeFooterTagline = escapeHtml(t("emailFooterTagline"));
  const safeFallbackUrlLabel = escapeHtml(t("emailFallbackUrlLabel"));

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${safeSubject}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0B0F19 !important; color: #F9FAFB !important; }
      .email-card { background-color: #131B2E !important; border-color: #232F46 !important; }
      .email-header-border { border-bottom-color: #232F46 !important; }
      .email-title { color: #F9FAFB !important; }
      .email-body { color: #D1D5DB !important; }
      .email-muted { color: #9CA3AF !important; }
      .email-callout { background-color: #0B0F19 !important; border-color: #232F46 !important; }
      .email-badge { background-color: #1E293B !important; color: #E2E8F0 !important; border-color: #334155 !important; }
      .email-divider { border-top-color: #232F46 !important; }
      .email-link { color: #F87171 !important; }
    }
  </style>
</head>
<body class="email-bg" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F4F5; margin: 0; padding: 24px 16px; color: #18181B; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; mso-hide: all;">
    ${safePreheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
    <tr>
      <td align="center">
        <div class="email-card" style="max-width: 480px; width: 100%; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E4E4E7; overflow: hidden; text-align: left; box-sizing: border-box;">
          <div class="email-header-border" style="padding: 20px 28px; border-bottom: 1px solid #F4F4F5;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 9999px; background-color: #E2001A; margin-right: 8px; vertical-align: middle;"></span>
                  <span class="email-title" style="font-size: 16px; font-weight: 800; letter-spacing: -0.02em; color: #09090B; vertical-align: middle;">${escapeHtml(t("appName"))}</span>
                </td>
                ${
                  safeGroupBadge
                    ? `<td align="right" valign="middle">
                  <span class="email-badge" style="display: inline-block; font-size: 12px; font-weight: 600; color: #3F3F46; background-color: #F4F4F5; border: 1px solid #E4E4E7; border-radius: 9999px; padding: 3px 10px;">${safeGroupBadge}</span>
                </td>`
                    : ""
                }
              </tr>
            </table>
          </div>
          <div style="padding: 28px;">
            <h1 class="email-title" style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: #09090B; line-height: 1.3;">
              ${safeTitle}
            </h1>
            ${
              safeGreeting
                ? `<p class="email-body" style="font-size: 15px; line-height: 1.6; color: #27272A; font-weight: 600; margin-top: 0; margin-bottom: 8px;">
              ${safeGreeting}
            </p>`
                : ""
            }
            <p class="email-body" style="font-size: 15px; line-height: 1.6; color: #3F3F46; margin-top: 0; margin-bottom: 20px;">
              ${safeLead}
            </p>
            ${options.bodyHtml ?? ""}
            ${options.calloutBoxHtml ?? ""}
            ${
              safeCtaLabel && safeCtaUrl
                ? `<div style="margin-top: 24px; margin-bottom: 24px;">
              <a href="${safeCtaUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #E2001A; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 10px; text-align: center;">
                ${safeCtaLabel}
              </a>
            </div>
            <p class="email-muted" style="font-size: 12px; line-height: 1.5; color: #71717A; margin-top: 0; margin-bottom: 16px; word-break: break-all;">
              ${safeFallbackUrlLabel}<br>
              <a href="${safeCtaUrl}" class="email-link" style="color: #E2001A; text-decoration: underline;">${safeCtaUrl}</a>
            </p>`
                : ""
            }
            ${
              safeHelperText
                ? `<p class="email-muted" style="font-size: 13px; line-height: 1.5; color: #71717A; margin-top: 0; margin-bottom: 8px;">
              ${safeHelperText}
            </p>`
                : ""
            }
            ${
              safeIgnoreNotice
                ? `<p class="email-muted" style="font-size: 13px; line-height: 1.5; color: #A1A1AA; margin-top: 0; margin-bottom: 0;">
              ${safeIgnoreNotice}
            </p>`
                : ""
            }
          </div>
          <div class="email-divider" style="padding: 16px 28px; border-top: 1px solid #F4F4F5; background-color: transparent;">
            <p class="email-muted" style="font-size: 12px; line-height: 1.5; color: #A1A1AA; margin: 0;">
              ${safeFooterTagline}
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderOtpEmail(to: string, otp: string): EmailPayload {
  const safeOtp = escapeHtml(otp);
  const subject = t("emailOtpSubject");
  const text = t("emailOtpBodyText", { code: otp });

  const calloutBoxHtml = `<div class="email-callout" style="background-color: #F4F4F5; border: 1px solid #E4E4E7; border-radius: 12px; padding: 18px 16px; text-align: center; margin-bottom: 20px;">
      <span class="email-title" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #09090B;">
        ${safeOtp}
      </span>
    </div>`;

  const html = renderPassieEmailLayout({
    subject,
    preheader: t("emailOtpPreheader", { code: otp }),
    title: t("emailOtpBodyHtmlTitle"),
    leadText: t("emailOtpBodyHtmlDesc"),
    calloutBoxHtml,
    helperText: t("emailOtpBodyHtmlExpiry"),
    ignoreNotice: t("emailOtpBodyHtmlIgnore"),
  });

  return { to, subject, html, text };
}

export interface RenderWelcomeEmailParams {
  to: string;
  displayName: string;
  groupName?: string;
  baseUrl?: string;
}

export function renderWelcomeEmail(params: RenderWelcomeEmailParams): EmailPayload {
  const groupName = params.groupName?.trim() || "Excelsior";
  const normalizedBaseUrl = (params.baseUrl?.trim() || "https://passie.goedvolk.org").replace(/\/+$/, "");
  const loginUrl = `${normalizedBaseUrl}/inloggen`;

  const subject = t("emailWelcomeSubject", { group: groupName });
  const text = t("emailWelcomeBodyText", {
    name: params.displayName,
    group: groupName,
    url: loginUrl,
  });

  const howToLoginTitle = escapeHtml(t("emailWelcomeHowToLogin"));
  const step1 = escapeHtml(t("emailWelcomeStep1", { url: normalizedBaseUrl }));
  const step2 = escapeHtml(t("emailWelcomeStep2"));
  const step3 = escapeHtml(t("emailWelcomeStep3"));
  const passkeyTip = escapeHtml(t("emailWelcomePasskeyTip"));

  const bodyHtml = `<div style="margin-bottom: 20px;">
      <p class="email-title" style="font-size: 14px; font-weight: 700; color: #09090B; margin-top: 0; margin-bottom: 8px;">
        ${howToLoginTitle}
      </p>
      <ol class="email-body" style="font-size: 14px; line-height: 1.6; color: #3F3F46; margin-top: 0; margin-bottom: 0; padding-left: 20px;">
        <li style="margin-bottom: 4px;">${step1}</li>
        <li style="margin-bottom: 4px;">${step2}</li>
        <li style="margin-bottom: 0;">${step3}</li>
      </ol>
    </div>`;

  const calloutBoxHtml = `<div class="email-callout" style="background-color: #F4F4F5; border: 1px solid #E4E4E7; border-radius: 10px; padding: 12px 14px; margin-bottom: 20px;">
      <p class="email-body" style="font-size: 13px; line-height: 1.5; color: #3F3F46; margin: 0;">
        ${passkeyTip}
      </p>
    </div>`;

  const html = renderPassieEmailLayout({
    subject,
    preheader: t("emailWelcomePreheader", { group: groupName }),
    title: t("emailWelcomeTitle"),
    greeting: t("emailWelcomeGreeting", { name: params.displayName }),
    leadText: t("emailWelcomeIntro", { group: groupName }),
    bodyHtml,
    calloutBoxHtml,
    ctaLabel: t("emailWelcomeCta"),
    ctaUrl: loginUrl,
    groupBadge: groupName,
  });

  return { to: params.to, subject, html, text };
}
