/**
 * The recurring job (design §Error handling).
 *
 * Everything here is a safety net rather than the main path. A booking that
 * goes well is delivered inline by the webhook and this never sees it. What
 * reaches this function is what went wrong: a generation that failed, a send
 * that failed, or a webhook that never arrived.
 *
 * Safe to run twice at once, near enough. `deliverWorkout` re-reads status and
 * skips anything already sent, so the only race is two runs starting on the
 * same row in the same instant, and the cost of that is one duplicate email
 * for one person. Locking would be machinery guarding nothing.
 */

import { and, asc, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deliverWorkout } from "./delivery";
import { pollReplies, type ReplyReport } from "./replies";

const { workouts } = schema;

/** Bounds the work one run can do, so a backlog cannot time the request out. */
const BATCH = 25;

export interface CronReport {
  considered: number;
  sent: number;
  retrying: number;
  failed: number;
  stale: number;
  replies: ReplyReport;
}

export async function runCron(now = new Date()): Promise<CronReport> {
  const report: CronReport = {
    considered: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
    stale: 0,
    replies: { polled: false, found: 0, filed: 0, ignored: 0, unmatched: 0, empty: 0 },
  };

  /*
   * Anything whose slot has already finished is abandoned rather than sent.
   * A workout that turns up after the session it was for is worse than no
   * workout: it is a thing to read, act on, and then realise was pointless.
   *
   * With three attempts fifteen minutes apart this should never fire. It
   * exists for the case the design cannot rule out, which is the app being
   * down for a day and then coming back with a queue.
   */
  const abandoned = await db
    .update(workouts)
    .set({ status: "failed", lastError: "the slot had already finished" })
    .where(
      and(
        inArray(workouts.status, ["pending", "generated"]),
        lt(
          sql`${workouts.slotStartsAt} + make_interval(mins => ${workouts.slotMinutes})`,
          now,
        ),
      ),
    )
    .returning({ id: workouts.id });

  report.stale = abandoned.length;

  const waiting = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(inArray(workouts.status, ["pending", "generated"]))
    .orderBy(asc(workouts.slotStartsAt))
    .limit(BATCH);

  report.considered = waiting.length;

  for (const { id } of waiting) {
    const delivery = await deliverWorkout(id);

    if (delivery.status === "sent") report.sent += 1;
    else if (delivery.status === "retry") report.retrying += 1;
    else if (delivery.status === "failed") report.failed += 1;
  }

  /*
   * After the retries, not before. A reply to a workout that is still being
   * re-sent has nothing to attach to yet.
   */
  try {
    report.replies = await pollReplies();
  } catch (err) {
    // A mailbox that is unreachable must not stop the retries that already ran.
    console.error("polling replies failed:", err);
  }

  return report;
}
