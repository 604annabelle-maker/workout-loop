/**
 * Filing replies (design §Replies).
 *
 * Optional, never prompted, never answered. A reply is stripped of quoted
 * text and filed against the workout it belongs to, where it feeds the next
 * generation.
 *
 * Silence means it worked. The only reply that gets a response is one that
 * could not be matched, because otherwise a lost note would vanish without
 * trace on a phone that cannot check anything.
 */

import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { eachUnseen, type Incoming } from "./mail-in";
import { sendMail } from "./mail-out";
import { matchWorkout, type Candidate } from "./reply-match";
import { normalizeMessageId, parseReply } from "./reply-parse";

const { feedback, workouts } = schema;

/**
 * How far back a subject-line match may reach. Message ids are exact and need
 * no window; subjects repeat once a year, and a reply to a workout from last
 * summer is not a thing that happens.
 */
const CANDIDATE_WINDOW = 50;

export interface ReplyReport {
  /** False when no mailbox is configured. */
  polled: boolean;
  found: number;
  filed: number;
  /** From somebody who is not the owner. */
  ignored: number;
  unmatched: number;
  empty: number;
}

export async function pollReplies(): Promise<ReplyReport> {
  const report: ReplyReport = {
    polled: false,
    found: 0,
    filed: 0,
    ignored: 0,
    unmatched: 0,
    empty: 0,
  };

  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();

  const result = await eachUnseen(async (message) => {
    await handle(message, owner, report);
  });

  report.polled = result.polled;
  report.found = result.found;

  return report;
}

async function handle(
  message: Incoming,
  owner: string | undefined,
  report: ReplyReport,
): Promise<void> {
  const reply = parseReply(message);

  /*
   * Anyone else is ignored outright. In phase one this only keeps junk out of
   * the table. In phase two, when a reply drives a model and sends mail back,
   * it becomes the thing standing between a stranger and the API bill, so it
   * is here from the start rather than added when it matters.
   */
  if (!owner || reply.from !== owner) {
    report.ignored += 1;
    return;
  }

  // An empty reply is somebody hitting send by accident. Nothing to file, and
  // an empty note in the prompt would be noise the model has to read past.
  if (!reply.body.trim()) {
    report.empty += 1;
    return;
  }

  const candidates: Candidate[] = await db
    .select({
      id: workouts.id,
      messageId: workouts.messageId,
      subject: workouts.subject,
    })
    .from(workouts)
    .where(eq(workouts.status, "sent"))
    .orderBy(desc(workouts.slotStartsAt))
    .limit(CANDIDATE_WINDOW);

  const match = matchWorkout(reply, candidates);
  const workoutId = match.how === "none" ? null : match.workoutId;

  await db
    .insert(feedback)
    .values({
      workoutId,
      // A message with no id cannot be deduplicated by id, so the mailbox's
      // own UID stands in. It is stable for as long as the message exists.
      sourceMessageId:
        normalizeMessageId(message.headers["message-id"]) ??
        `imap-uid-${message.uid}@workout-loop.invalid`,
      body: reply.body,
    })
    .onConflictDoNothing({ target: feedback.sourceMessageId });

  if (workoutId) {
    report.filed += 1;
    return;
  }

  report.unmatched += 1;
  await sayItDidNotLand(reply.subject, match.how === "none" ? match.why : "");
}

/**
 * Kept, but say so.
 *
 * The note exists because the alternative is a reply that quietly goes
 * nowhere, and there is no way to notice that from a phone with no browser.
 */
async function sayItDidNotLand(subject: string, why: string): Promise<void> {
  const to = process.env.OWNER_EMAIL;
  if (!to) return;

  const text =
    `Your reply was saved, but it could not be tied to a particular workout ` +
    `(${why}), so it will not shape the next one.\n\n` +
    `Replying directly to a workout email is what links the two.`;

  await sendMail({
    to,
    subject: `Saved, but not attached to a workout${subject ? `: ${subject}` : ""}`,
    text,
    html: `<p style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6">${text.replace(/\n\n/g, "</p><p>")}</p>`,
  });
}
