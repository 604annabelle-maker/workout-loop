/**
 * Getting a workout from booked to sent (design §Error handling).
 *
 * One function does the work, called both by the webhook when a booking
 * arrives and by the cron when something needs another go. A retry is not a
 * different path through the system, it is the same path run again.
 *
 * Every step is resumable, because each one records what it achieved before
 * moving on. A workout that generated but failed to send is not regenerated;
 * the plan is already in the row.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Booking } from "./booking-payload";
import { sendMail, type Mail } from "./mail-out";
import { readPlanV2 } from "../training/history";
import { mailFor, planNext } from "./v2";
import { dateOnly } from "./when";

const { workouts } = schema;

/** Tries this many times, then says so rather than going quiet. */
export const MAX_ATTEMPTS = 3;

export type Delivery =
  | { status: "sent"; messageId: string | null }
  | { status: "retry"; reason: string; attempts: number }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

/**
 * Records the booking, or recognises one already recorded.
 *
 * The unique index on booking_ref does the work. A webhook delivered twice
 * inserts once, and nothing has to remember to check.
 */
export async function recordBooking(
  booking: Booking,
): Promise<{ id: string; created: boolean }> {
  const inserted = await db
    .insert(workouts)
    .values({
      bookingRef: booking.bookingRef,
      slotStartsAt: booking.slotStartsAt,
      slotMinutes: booking.slotMinutes,
      focus: booking.focus ?? null,
      note: booking.note ?? null,
    })
    .onConflictDoNothing({ target: workouts.bookingRef })
    .returning({ id: workouts.id });

  if (inserted[0]) return { id: inserted[0].id, created: true };

  const [existing] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.bookingRef, booking.bookingRef));

  return { id: existing.id, created: false };
}

export async function deliverWorkout(workoutId: string): Promise<Delivery> {
  const [workout] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, workoutId));

  if (!workout) return { status: "skipped", reason: "no such workout" };
  if (workout.status === "sent") return { status: "skipped", reason: "already sent" };
  if (workout.status === "failed") return { status: "skipped", reason: "given up" };

  const to = process.env.OWNER_EMAIL;
  if (!to) return recordFailure(workout, "OWNER_EMAIL is not set");

  return planAndSend(workout, to);
}

/**
 * A v2 workout: planned from the training log, checked, written down before
 * sending so a retry sends the same plan, then the new email.
 */
async function planAndSend(workout: WorkoutRow, to: string): Promise<Delivery> {
  let plan = readPlanV2(workout.planV2);
  if (!plan) {
    try {
      plan = (await planNext({ now: workout.slotStartsAt, focus: workout.focus })).plan;
      await db.update(workouts).set({ version: 2, planV2: plan, status: "generated" }).where(eq(workouts.id, workout.id));
    } catch (err) {
      return recordFailure(workout, `planning failed: ${err}`);
    }
  }
  const token = workout.logToken ?? newLogToken();
  if (!workout.logToken) await db.update(workouts).set({ logToken: token }).where(eq(workouts.id, workout.id));
  return send(workout, to, await mailFor(plan, { date: workout.slotStartsAt, token }));
}

/** A new secret for a workout's log form. */
export function newLogToken(): string {
  return randomBytes(18).toString("base64url");
}

type WorkoutRow = typeof workouts.$inferSelect;

async function send(workout: WorkoutRow, to: string, mail: Omit<Mail, "to">): Promise<Delivery> {
  const result = await sendMail({ to, ...mail });

  if (!result.sent) {
    return recordFailure(workout, `send failed: ${result.reason ?? "unknown"}`);
  }

  await db
    .update(workouts)
    .set({
      status: "sent",
      messageId: result.messageId,
      subject: mail.subject,
      sentAt: new Date(),
      // Cleared on success. A sent workout still carrying the error from the
      // attempt before reads as a contradiction the next time anyone looks.
      lastError: null,
    })
    .where(eq(workouts.id, workout.id));

  return { status: "sent", messageId: result.messageId };
}

async function recordFailure(
  workout: WorkoutRow,
  reason: string,
): Promise<Delivery> {
  const attempts = workout.attempts + 1;
  const givingUp = attempts >= MAX_ATTEMPTS;

  await db
    .update(workouts)
    .set({
      attempts,
      lastError: reason.slice(0, 500),
      ...(givingUp ? { status: "failed" as const } : {}),
    })
    .where(eq(workouts.id, workout.id));

  console.error(`workout ${workout.id} attempt ${attempts}: ${reason}`);

  if (!givingUp) return { status: "retry", reason, attempts };

  await sayNothingIsComing(workout);
  return { status: "failed", reason };
}

/**
 * A workout that never arrives must not arrive silently.
 *
 * Reading nothing is indistinguishable from not having booked, and on a phone
 * that cannot check a website there is no other way to find out.
 */
async function sayNothingIsComing(workout: WorkoutRow): Promise<void> {
  const to = process.env.OWNER_EMAIL;
  if (!to) return;

  const when = dateOnly(workout.slotStartsAt);

  await sendMail({
    to,
    subject: `No workout for ${when}`,
    text:
      `Your slot on ${when} is booked, but a workout could not be generated ` +
      `after ${MAX_ATTEMPTS} attempts.\n\n` +
      `Train as you see fit. Nothing else is wrong with the booking.`,
    html: `<p style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6">
      Your slot on ${when} is booked, but a workout could not be generated after
      ${MAX_ATTEMPTS} attempts. Train as you see fit. Nothing else is wrong with
      the booking.</p>`,
  });
}
