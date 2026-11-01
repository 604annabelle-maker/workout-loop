/**
 * Sending the weekly review (./review.ts decides what it says).
 *
 * Called by the cron every fifteen minutes and almost always does nothing.
 * From Sunday 07:00 in Jerusalem it sends the review of the week just ended,
 * once: the unique week_of on the reviews table is what makes "once" true,
 * the same way booking_ref makes a webhook idempotent.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendMail } from "./mail-out";
import { readPreferences } from "./preferences";
import { composeReview } from "./review";
import { isoDate, localParts, weekStart } from "./when";
import { trainingLog } from "./workouts";

const { reviews } = schema;

/** Sunday morning, after the week has ended and before the new one starts. */
const SEND_FROM_HOUR = 7;

export type ReviewReport =
  | { status: "not due" }
  | { status: "sent"; weekOf: string }
  | { status: "skipped"; weekOf: string; reason: string }
  | { status: "failed"; reason: string };

export async function sendWeeklyReview(now = new Date()): Promise<ReviewReport> {
  const local = localParts(now);

  // Sunday from 07:00, or Monday as a catch up if Sunday's runs all failed.
  const due = (local.weekday === 0 && local.hour >= SEND_FROM_HOUR) || local.weekday === 1;
  if (!due) return { status: "not due" };

  const to = weekStart(now);
  const from = weekStart(new Date(to.getTime() - 12 * 60 * 60 * 1000));
  const weekOf = isoDate(from);

  const [already] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.weekOf, weekOf));
  if (already) return { status: "not due" };

  /*
   * Claimed before sending, so two overlapping cron runs cannot both send. A
   * send that fails gives the claim back so the next run tries again.
   */
  const claimed = await db
    .insert(reviews)
    .values({ weekOf })
    .onConflictDoNothing({ target: reviews.weekOf })
    .returning({ id: reviews.id });
  if (!claimed[0]) return { status: "not due" };

  const preferences = await readPreferences();
  const owner = process.env.OWNER_EMAIL;
  if (!preferences.weeklyReview) return { status: "skipped", weekOf, reason: "turned off" };
  if (!owner) return { status: "skipped", weekOf, reason: "OWNER_EMAIL is not set" };

  const sessions = await trainingLog(120, now);
  // Only sessions the coach planned: a workout from before then carries no
  // muscle data, and a review of it would be a page of zeros.
  const inWeek = sessions.filter((s) => s.plan && s.at >= from && s.at < to).length;

  // No training, no email. A review of nothing reads as a reproach.
  if (inWeek === 0) return { status: "skipped", weekOf, reason: "no sessions" };

  const review = composeReview({ sessions, preferences, from, to });
  const result = await sendMail({ to: owner, ...review });

  if (!result.sent) {
    await db.delete(reviews).where(eq(reviews.id, claimed[0].id));
    return { status: "failed", reason: result.reason ?? "send failed" };
  }

  await db.update(reviews).set({ messageId: result.messageId }).where(eq(reviews.id, claimed[0].id));
  return { status: "sent", weekOf };
}
