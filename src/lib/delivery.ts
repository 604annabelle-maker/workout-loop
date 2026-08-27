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

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Booking } from "./booking-payload";
import { generateWorkout } from "./generate";
import { sendMail } from "./mail-out";
import { readPreferences } from "./preferences";
import { dateOnly } from "./when";
import { composeWorkoutMail } from "./workout-mail";
import { recentWorkouts } from "./workouts";

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

  const slot = { startsAt: workout.slotStartsAt, minutes: workout.slotMinutes };
  let planText = workout.planText;

  if (!planText) {
    try {
      const generated = await generateWorkout(
        await readPreferences(),
        await recentWorkouts(),
        slot,
      );
      planText = generated.planText;

      // Written down before the send is attempted. If the send fails, the next
      // attempt sends this plan rather than paying to write another one.
      await db
        .update(workouts)
        .set({ planText, status: "generated" })
        .where(eq(workouts.id, workoutId));
    } catch (err) {
      return recordFailure(workout, `generation failed: ${err}`);
    }
  }

  const mail = composeWorkoutMail(planText, slot);
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
    .where(eq(workouts.id, workoutId));

  return { status: "sent", messageId: result.messageId };
}

type WorkoutRow = typeof workouts.$inferSelect;

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
