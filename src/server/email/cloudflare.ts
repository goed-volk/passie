import type { EmailPayload, Mailer } from "./types";

export interface CloudflareSendEmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

export class CloudflareMailer implements Mailer {
  constructor(
    private readonly binding: CloudflareSendEmailBinding,
    private readonly fromAddress: string = "inloggen@passie.goedvolk.org"
  ) {}

  async send(payload: EmailPayload): Promise<void> {
    await this.binding.send({
      to: payload.to,
      from: this.fromAddress,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  }
}
