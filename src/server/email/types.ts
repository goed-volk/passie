export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailKind = "otp" | "welcome";

export type EmailTrigger =
  | "sign-in"
  | "member_created"
  | "member_email_linked"
  | "cli_link";

export interface Mailer {
  send(payload: EmailPayload): Promise<{ messageId?: string } | void>;
}
