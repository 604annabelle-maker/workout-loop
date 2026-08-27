/**
 * Reading the mailbox (design §Architecture).
 *
 * Connection handling only. What a message means is decided by the pure
 * modules: ./reply-parse.ts pulls it apart, ./reply-match.ts decides which
 * workout it answers.
 *
 * Each message is marked seen after it has been handled, whether handling
 * succeeded or not. Leaving one unseen after a failure sounds safer but is
 * worse: an unmatched reply sends a note back, so a message that cannot be
 * handled would send that note again every fifteen minutes forever. Filing is
 * idempotent through the unique index, so a message seen twice costs nothing.
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { mailbox } from "./mailbox";
import type { RawMessage } from "./reply-parse";

export interface Incoming extends RawMessage {
  uid: number;
}

export interface PollResult {
  /** False when no mailbox is configured. */
  polled: boolean;
  found: number;
}

export async function eachUnseen(
  handle: (message: Incoming) => Promise<void>,
): Promise<PollResult> {
  const box = mailbox();
  if (!box) return { polled: false, found: 0 };

  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: { user: box.address, pass: box.password },
    // Otherwise every poll writes a wall of connection chatter to the log.
    logger: false,
  });

  await client.connect();

  try {
    const messages: Incoming[] = [];

    /*
     * Collected first, handled after. Doing the work inside the fetch loop
     * holds the mailbox lock across a database write and an outbound email,
     * which is a long time to keep a connection busy for no reason.
     */
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
        // The server can decline to return a body. Nothing to read, so nothing
        // to do, and it stays unseen for the next poll to try again.
        if (!message.source) continue;

        // Annotated because simpleParser also has a callback overload, and
        // inference picks the wrong one.
        const parsed: ParsedMail = await simpleParser(message.source);

        messages.push({
          uid: message.uid,
          headers: {
            "message-id": parsed.messageId ?? "",
            "in-reply-to": parsed.inReplyTo ?? "",
            references: Array.isArray(parsed.references)
              ? parsed.references.join(" ")
              : (parsed.references ?? ""),
            subject: parsed.subject ?? "",
            from: parsed.from?.text ?? "",
          },
          text: parsed.text ?? "",
        });
      }
    } finally {
      lock.release();
    }

    for (const message of messages) {
      try {
        await handle(message);
      } catch (err) {
        console.error(`handling message uid ${message.uid} failed:`, err);
      }

      await client.messageFlagsAdd({ uid: String(message.uid) }, ["\\Seen"], {
        uid: true,
      });
    }

    return { polled: true, found: messages.length };
  } finally {
    await client.logout().catch(() => client.close());
  }
}
