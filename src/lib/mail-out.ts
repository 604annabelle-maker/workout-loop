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
import { pictureFile } from "./picture-library";
import { normalizeMessageId } from "./reply-parse";
import type { Inline } from "./workout-mail";

export interface Mail {
  to: string;
  subject: string;
  /** The real body. */
  text: string;
  /** A wrapper around the same words, for reading on a computer. */
  html: string;
  /** Pictures the HTML refers to by Content-ID. */
  inline?: Inline[];
  /** A dynamic (AMP for Email) version, shown by Gmail when it allows one. */
  amp?: string;
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
      ...(mail.amp ? { amp: mail.amp } : {}),
      /*
       * `inline` rather than `attachment`, which is what keeps these in the
       * body where the HTML puts them instead of in a row of files at the
       * bottom. nodemailer reads each one off disk and sends the message as
       * multipart/related.
       */
      attachments: (mail.inline ?? []).flatMap((picture) => {
        const path = pictureFile(picture.source, picture.file);
        return path ? [{ cid: picture.cid, filename: picture.filename, path, contentDisposition: "inline" as const }] : [];
      }),
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
  const pictures = mail.inline?.length ?? 0;

  console.log(
    `\n──────────────── email (not sent, no mailbox configured) ────────────────\n` +
      `  To:      ${mail.to}\n` +
      `  Subject: ${mail.subject}\n` +
      `  In body: ${pictures} picture${pictures === 1 ? "" : "s"}\n\n` +
      `${mail.text}\n` +
      `────────────────────────────────────────────────────────────────\n`,
  );

  return {
    sent: true,
    messageId: `local-${randomUUID()}@workout-loop.invalid`,
    reason: "no-mailbox",
  };
}
