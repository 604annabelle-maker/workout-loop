/**
 * The database (design §Data model).
 *
 * Three tables. One row of preferences, one row per booked slot, and one row
 * per reply that gets filed.
 */

import { sql } from "drizzle-orm";
import {
  check,
  integer,
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
 */
export const workoutStatus = pgEnum("workout_status", [
  "pending",
  "generated",
  "sent",
  "failed",
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
  status: workoutStatus("status").notNull().default("pending"),
  /** The workout and its explanations, as sent. */
  planText: text("plan_text"),
  /**
   * The Message-ID of the email that went out, angle brackets stripped. This
   * is how a reply finds its way back to the workout it answers.
   */
  messageId: text("message_id"),
  /** Stored so the subject-line fallback has something to compare against. */
  subject: text("subject"),
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
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
