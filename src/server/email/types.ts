export interface EmailSender {
  email: string;
  name?: string;
}

export const PASSIE_SENDER_AUTH: EmailSender = {
  name: "Passie",
  email: "inloggen@passie.goedvolk.org",
};

export const PASSIE_SENDER_NOREPLY: EmailSender = {
  name: "Passie",
  email: "noreply@passie.goedvolk.org",
};

export interface EmailPayload {
  to: string;
  from?: EmailSender | string;
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
