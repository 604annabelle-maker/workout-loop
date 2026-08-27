CREATE TYPE "public"."workout_status" AS ENUM('pending', 'generated', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid,
	"source_message_id" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_source_message_id_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"training_days_per_week" integer DEFAULT 3 NOT NULL,
	"avoid" text DEFAULT '' NOT NULL,
	"equipment" text DEFAULT '' NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_is_a_singleton" CHECK ("preferences"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_ref" text NOT NULL,
	"slot_starts_at" timestamp with time zone NOT NULL,
	"slot_minutes" integer NOT NULL,
	"status" "workout_status" DEFAULT 'pending' NOT NULL,
	"plan_text" text,
	"message_id" text,
	"subject" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "workouts_booking_ref_unique" UNIQUE("booking_ref")
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;