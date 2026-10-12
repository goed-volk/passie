export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(payload: EmailPayload): Promise<void>;
}
