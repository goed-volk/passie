export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailKind =
  | "otp"
  | "welcome"
  | "pass_assigned"
  | "deadline_reminder";

export type EmailTrigger =
  | "sign-in"
  | "member_created"
  | "member_email_linked"
  | "cli_link"
  | "pool_mutation"
  | "admin_manual";

export interface Mailer {
  send(payload: EmailPayload): Promise<{ messageId?: string } | void>;
}
