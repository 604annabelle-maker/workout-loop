CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"token" text NOT NULL,
	"message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enjoying" text,
	"length" text,
	"comment" text,
	"answered_at" timestamp with time zone,
	CONSTRAINT "checkins_month_unique" UNIQUE("month"),
	CONSTRAINT "checkins_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_is_a_singleton" CHECK ("equipment"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "exercise_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"exercise_id" text NOT NULL,
	"used_swap" boolean DEFAULT false NOT NULL,
	"weight" real,
	"reps" jsonb NOT NULL,
	"tap" text NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_log_workout_slot" UNIQUE("workout_id","slot")
);
--> statement-breakpoint
CREATE TABLE "memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"exercise_id" text,
	"text" text NOT NULL,
	"workout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "plan_v2" jsonb;--> statement-breakpoint
ALTER TABLE "exercise_log" ADD CONSTRAINT "exercise_log_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;