/**
 * Filing replies (design §Replies).
 *
 * Optional, never required, never chased. A reply is stripped of quoted text
 * and filed against the workout it belongs to, then read into a log of what
 * she lifted and how she felt (./reply-read.ts). The prose feeds the next
 * generation as it always did; the log is what progress is measured from.
 *
 * Filing and reading are two steps on purpose. Filing is a database write
 * that cannot fail for any interesting reason; reading calls a model that
 * can. A reply is never lost because it could not be read: it is filed first,
 * and reading is retried by the cron until it works or gives up.
 *
 * Silence means it worked. What was read shows up at the top of the next
 * workout, where a misreading can be corrected. The only reply that gets an
 * answer of its own is one that could not be matched to a workout, because
 * otherwise a lost note would vanish without trace on a phone that cannot
 * check anything.
 */

import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { eachUnseen, type Incoming } from "./mail-in";
import { sendMail } from "./mail-out";
import { readPlan, type Plan } from "./plan";
import { isEmptyLog } from "./reply-log";
import { readReply } from "./reply-read";
import { matchWorkout, type Candidate } from "./reply-match";
import { normalizeMessageId, parseReply } from "./reply-parse";
import { readFeedbackV2 } from "./v2";

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
  /** Replies read into a log this run, including retries of earlier ones. */
  read: number;
}

export async function pollReplies(): Promise<ReplyReport> {
  const report: ReplyReport = {
    polled: false,
    found: 0,
    filed: 0,
    ignored: 0,
    unmatched: 0,
    empty: 0,
    read: 0,
  };

  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();

  const result = await eachUnseen(async (message) => {
    await handle(message, owner, report);
  });

  report.polled = result.polled;
  report.found = result.found;

  // After filing, so this run's replies are read in the same pass, and so
  // anything that failed to read last time gets another go.
  report.read = await readPendingLogs();

  return report;
}

/** Tries this many times to read a reply, then leaves it to the prose. */
const READ_ATTEMPTS = 3;

/** How far back an unread reply is still worth reading. */
const READ_WINDOW_DAYS = 14;

/**
 * Reads every filed reply that has not been read yet. Returns how many were.
 *
 * Never throws: a reply that cannot be read stays filed as prose, which is
 * exactly what the app did for its first two months.
 */
export async function readPendingLogs(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - READ_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pending = await db
    .select({
      id: feedback.id,
      body: feedback.body,
      attempts: feedback.logAttempts,
      plan: workouts.plan,
      version: workouts.version,
    })
    .from(feedback)
    .innerJoin(workouts, eq(feedback.workoutId, workouts.id))
    .where(
      and(
        isNull(feedback.log),
        lt(feedback.logAttempts, READ_ATTEMPTS),
        gte(feedback.receivedAt, since),
      ),
    )
    .limit(10);

  let read = 0;

  for (const row of pending) {
    // A reply to a v2 workout: shorthand into its exercise log, the rest into memory.
    if (row.version === 2) {
      try {
        if (await readFeedbackV2(row.id)) read += 1;
      } catch (err) {
        console.error(`reading v2 reply ${row.id} failed:`, err);
      }
      continue;
    }
    let plan: Plan | null = null;
    try {
      plan = row.plan ? readPlan(row.plan) : null;
    } catch {
      plan = null;
    }

    try {
      const log = await readReply(row.body, plan);
      await db
        .update(feedback)
        .set({
          // An empty log is still a read: there was simply nothing to record.
          log: isEmptyLog(log) ? { ...log, empty: true } : log,
          logAttempts: row.attempts + 1,
        })
        .where(eq(feedback.id, row.id));
      read += 1;
    } catch (err) {
      console.error(`reading reply ${row.id} failed:`, err);
      await db
        .update(feedback)
        .set({ logAttempts: row.attempts + 1 })
        .where(eq(feedback.id, row.id));
    }
  }

  return read;
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
