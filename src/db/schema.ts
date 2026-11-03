/**
 * The database (design §Data model).
 *
 * Four tables. One row of preferences, one row per booked slot, one row per
 * reply that gets filed, and one row per weekly review sent.
 *
 * The structured columns are JSON rather than tables of their own. There is
 * one person and a few hundred sessions a year; every question asked of them
 * is answered by reading a few months into memory and counting there, in
 * pure code that can be tested without a database.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * `pending` — the booking is recorded, no workout exists yet.
 * `generated` — a plan exists but has not gone out.
 * `sent` — the email is away.
 * `failed` — gave up after three attempts, and said so.
 * `preview` — a sample sent to look at, which never counts as training.
 */
export const workoutStatus = pgEnum("workout_status", [
  "pending",
  "generated",
  "sent",
  "failed",
  "preview",
]);

/**
 * Exactly one row, held there by the check constraint rather than by everyone
 * remembering. There is one person; a second row could only ever be a bug.
 */
export const preferences = pgTable(
  "preferences",
  {
    id: integer("id").primaryKey().default(1),
    goals: text("goals").notNull().default(""),
    experience: text("experience").notNull().default(""),
    trainingDaysPerWeek: integer("training_days_per_week").notNull().default(3),
    /** Injuries and movements to stay away from. */
    avoid: text("avoid").notNull().default(""),
    /** What is actually in the gym. Its own field so it cannot be forgotten. */
    equipment: text("equipment").notNull().default(""),
    /** beginner, intermediate or advanced. Scales the weekly set targets. */
    level: text("level").notNull().default("intermediate"),
    /** Up to two muscle groups, comma separated, taken to the top of their range. */
    priorities: text("priorities").notNull().default(""),
    /** Movements and formats she loves. */
    enjoys: text("enjoys").notNull().default(""),
    /** Show cycle day and read period mentions. Never programs by phase. */
    cycleTracking: boolean("cycle_tracking").notNull().default(false),
    /** How many sessions a week open with jumps, 0 to 3. */
    jumpDays: integer("jump_days").notNull().default(1),
    /** A short progress email once a week. */
    weeklyReview: boolean("weekly_review").notNull().default(true),
    /** Anything else, in their own words. */
    brief: text("brief").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("preferences_is_a_singleton", sql`${t.id} = 1`)],
);

export const workouts = pgTable("workouts", {
  id: id(),
  /**
   * The booking's id in the Ellé Fitness app. Unique, which is the whole of
   * the webhook's idempotency: a delivery that arrives twice inserts once.
   */
  bookingRef: text("booking_ref").notNull().unique(),
  slotStartsAt: timestamp("slot_starts_at", { withTimezone: true }).notNull(),
  slotMinutes: integer("slot_minutes").notNull(),
  /** Upper, lower or full body, when she asked for one by hand. */
  focus: text("focus"),
  /** What she wrote when she asked for this workout by hand. */
  note: text("note"),
  status: workoutStatus("status").notNull().default("pending"),
  /**
   * The workout as plain text, as sent. For workouts from before plans were
   * structured this is the only record of what was prescribed.
   */
  planText: text("plan_text"),
  /** The workout as structured data (lib/plan.ts). Null before October 2026. */
  plan: jsonb("plan"),
  /**
   * What the coach decided before generating (lib/coach.ts): the session
   * type, the block and week, the load targets. Kept so a retry sends exactly
   * what the first attempt would have, and so the next brief knows where in
   * the block this one was.
   */
  brief: jsonb("brief"),
  /**
   * The Message-ID of the email that went out, angle brackets stripped. This
   * is how a reply finds its way back to the workout it answers.
   */
  messageId: text("message_id"),
  /** Stored so the subject-line fallback has something to compare against. */
  subject: text("subject"),
  /**
   * What she logged by tapping in the email (lib/taps.ts): done, easy, hard,
   * skipped or swapped per exercise, what she typed, and her comment.
   */
  taps: jsonb("taps"),
  /**
   * A random secret in the email's log buttons, so a tap can only ever be
   * filed against the workout it came from. Unique, since it is the lookup.
   */
  logToken: text("log_token").unique(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

/**
 * A reply, filed. One direction: phase one does not answer.
 *
 * Phase two adds a `direction` column defaulting to `in` and starts writing
 * `out` rows. One column, no data rewrite.
 */
export const feedback = pgTable("feedback", {
  id: id(),
  /** Null when a reply could not be tied to a workout. Kept, not dropped. */
  workoutId: uuid("workout_id").references(() => workouts.id, {
    onDelete: "cascade",
  }),
  /** Unique, so the same reply is never filed twice. */
  sourceMessageId: text("source_message_id").notNull().unique(),
  body: text("body").notNull(),
  /**
   * What the reply says, as data (lib/reply-log.ts): what was lifted, how it
   * felt. Null until it has been read, which happens after filing so a
   * failure to read never loses the reply itself.
   */
  log: jsonb("log"),
  /** Reading is retried a few times, then left to the prose. */
  logAttempts: integer("log_attempts").notNull().default(0),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A weekly review, sent. The unique week is the whole of its idempotency: a
 * cron that runs every fifteen minutes sends each week's review once.
 */
export const reviews = pgTable("reviews", {
  id: id(),
  /** The Sunday the week began, as YYYY-MM-DD in Jerusalem. */
  weekOf: text("week_of").notNull().unique(),
  messageId: text("message_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});
