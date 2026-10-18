import {
  type EmailPayload,
  type EmailSender,
  type Mailer,
  PASSIE_SENDER_NOREPLY,
} from "./types";

export interface CloudflareSendEmailBinding {
  send(message: {
    to: string | { email: string; name?: string };
    from: string | { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

export class CloudflareMailer implements Mailer {
  constructor(
    private readonly binding: CloudflareSendEmailBinding,
    private readonly defaultFrom: EmailSender | string = PASSIE_SENDER_NOREPLY
  ) {}

  async send(payload: EmailPayload): Promise<{ messageId?: string } | void> {
    const from = payload.from ?? this.defaultFrom;
    const result = (await this.binding.send({
      to: payload.to,
      from,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    })) as { messageId?: string } | undefined;

    return { messageId: result?.messageId };
  }
}
