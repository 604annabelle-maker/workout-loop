/**
 * Sending (design §Architecture).
 *
 * Transport only. What the message says is decided in ./workout-mail.ts.
 *
 * Never throws. A send that fails returns a reason, and the caller leaves the
 * workout `generated` so the cron can try again without regenerating it.
 */

import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { mailbox } from "./mailbox";
import { normalizeMessageId } from "./reply-parse";

export interface Mail {
  to: string;
  subject: string;
  /** The real body. */
  text: string;
  /** A wrapper around the same words, for reading on a computer. */
  html: string;
}

export interface SendResult {
  sent: boolean;
  /** Angle brackets stripped, so it compares directly against In-Reply-To. */
  messageId: string | null;
  reason?: string;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const box = mailbox();

  // No mailbox configured, so there is nowhere to send from.
  if (!box) return printInstead(mail);

  try {
    const port = Number(process.env.SMTP_PORT) || 465;

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: box.address, pass: box.password },
    });

    const info = await transport.sendMail({
      // Replies go back to whoever sent it, and that address is the mailbox the
      // reply poller reads. One account, both directions, no reply-to needed.
      from: box.address,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    return { sent: true, messageId: normalizeMessageId(info.messageId) };
  } catch (err) {
    console.error(`sending to ${mail.to} failed:`, err);
    return { sent: false, messageId: null, reason: String(err) };
  }
}

/**
 * No mailbox configured, so the message goes to the console.
 *
 * This reports success on purpose. The delivery step did complete; the
 * configured destination in development happens to be a terminal. Reporting
 * failure would leave every local workout stuck at `generated` and would make
 * the loop unrunnable on a laptop, which the design explicitly wants to keep
 * possible. The `.invalid` message id can never collide with a real one.
 */
function printInstead(mail: Mail): SendResult {
  console.log(
    `\n──────────────── email (not sent, no mailbox configured) ────────────────\n` +
      `  To:      ${mail.to}\n` +
      `  Subject: ${mail.subject}\n\n` +
      `${mail.text}\n` +
      `────────────────────────────────────────────────────────────────\n`,
  );

  return {
    sent: true,
    messageId: `local-${randomUUID()}@workout-loop.invalid`,
    reason: "no-mailbox",
  };
}
