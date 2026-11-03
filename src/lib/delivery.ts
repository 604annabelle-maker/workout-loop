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
import { buildBrief, current, reviveBrief, storeBrief, type Brief } from "./coach";
import { generateWorkout } from "./generate";
import { sendMail } from "./mail-out";
import { exerciseKey, mainExercises, readPlan, type Plan } from "./plan";
import { workoutPictures } from "./picture-library";
import { readPreferences } from "./preferences";
import { PICTURE_EXPOSURES } from "./program";
import { exposures, type Session } from "./progress";
import { appUrl, forgotten } from "./reminders";
import { snapshot } from "./summary";
import { dateOnly } from "./when";
import { composeAmp } from "./workout-amp";
import { composeLegacyMail, composeText, composeWorkoutMail, type Composed } from "./workout-mail";
import { sessionsSent, trainingLog } from "./workouts";

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

  const slot = { startsAt: workout.slotStartsAt, minutes: workout.slotMinutes };

  /*
   * Read whether or not a plan has to be generated. A retry sends the plan
   * already in the row, and it has to carry the same bars and the same
   * last-time lines the first attempt would have. Only sessions planned the
   * current way count: progress started fresh with it.
   */
  const sessions = current((await trainingLog()).filter((s) => s.at < slot.startsAt));

  let plan: Plan | null = null;
  try {
    plan = workout.plan ? readPlan(workout.plan) : null;
  } catch {
    plan = null;
  }
  let brief = reviveBrief(workout.brief);

  // A plain text plan with no structure is a workout generated before the
  // coach existed and never sent. Send it as written rather than paying to
  // write another one.
  if (!plan && workout.planText) {
    const mail = composeLegacyMail(workout.planText, slot);
    return send(workout, to, mail);
  }

  if (!plan || !brief) {
    try {
      const preferences = await readPreferences();
      brief = buildBrief({
        preferences,
        sessions,
        slot,
        sessionNumber: (await sessionsSent()) + 1,
        // Kept on the row, so a retry asks for the same session.
        request: {
          focus: workout.focus === "upper" || workout.focus === "lower" || workout.focus === "full" ? workout.focus : null,
          note: workout.note,
        },
      });

      const generated = await generateWorkout({ preferences, sessions, brief, slot });
      plan = generated.plan;

      // Written down before the send is attempted. If the send fails, the next
      // attempt sends this plan rather than paying to write another one.
      await db
        .update(workouts)
        .set({
          plan,
          brief: storeBrief(brief),
          planText: composeText({ plan, brief, slot, snapshot: null }),
          status: "generated",
        })
        .where(eq(workouts.id, workoutId));
    } catch (err) {
      return recordFailure(workout, `generation failed: ${err}`);
    }
  }

  // The secret in this email's log buttons. Kept on a retry, so an email
  // that did go out despite a reported failure still logs to this row.
  const token = workout.logToken ?? newLogToken();
  if (!workout.logToken) {
    await db.update(workouts).set({ logToken: token }).where(eq(workouts.id, workoutId));
  }

  return send(workout, to, workoutMail({ plan, brief, slot, sessions, token }));
}

/**
 * The email for a planned workout, all three versions: pictures for what she
 * is still learning, the bars, the earlier workouts to ask about, and log
 * buttons that post with this workout's secret.
 */
export function workoutMail(input: {
  plan: Plan;
  brief: Brief;
  slot: { startsAt: Date; minutes: number };
  sessions: Session[];
  token: string;
}): Composed {
  const { plan, brief, slot, sessions, token } = input;
  const names = mainExercises(plan).map((e) => e.name);
  const seen = exposures(sessions, slot.startsAt);
  const base = appUrl();

  return composeWorkoutMail(
    {
      plan,
      brief,
      slot,
      snapshot: snapshot(sessions, brief, slot.startsAt, plan),
      pictures: workoutPictures(names),
      learning: new Set(
        names.filter((n) => (seen.get(exerciseKey(n)) ?? 0) < PICTURE_EXPOSURES).map((n) => n.trim().toUpperCase()),
      ),
      log: base ? { base, token } : null,
      unlogged: forgotten(sessions),
    },
    composeAmp,
  );
}

/** A new secret for a workout's log buttons. */
export function newLogToken(): string {
  return randomBytes(18).toString("base64url");
}

type WorkoutRow = typeof workouts.$inferSelect;

async function send(
  workout: WorkoutRow,
  to: string,
  mail: ReturnType<typeof composeWorkoutMail>,
): Promise<Delivery> {
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
