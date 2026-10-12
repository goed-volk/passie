import type { EmailPayload, Mailer } from "./types";

export class ConsoleMailer implements Mailer {
  private lastPayload?: EmailPayload;

  async send(payload: EmailPayload): Promise<void> {
    this.lastPayload = payload;
    console.log(`[mailer:console] To: ${payload.to} | Subject: ${payload.subject}`);
    console.log(`[mailer:console] Body:\n${payload.text}`);
  }

  getLastPayload(): EmailPayload | undefined {
    return this.lastPayload;
  }
}
