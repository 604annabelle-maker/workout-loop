CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_of" text NOT NULL,
	"message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_week_of_unique" UNIQUE("week_of")
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "log" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "log_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "level" text DEFAULT 'intermediate' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "priorities" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "enjoys" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "cycle_tracking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "weekly_review" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "brief" jsonb;