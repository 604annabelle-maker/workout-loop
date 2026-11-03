ALTER TYPE "public"."workout_status" ADD VALUE 'preview';--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "taps" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "log_token" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_log_token_unique" UNIQUE("log_token");--> statement-breakpoint
-- Her priorities are her arms (she chose arms over glutes when planning the
-- rebuild). Set once here, and still editable on the settings page.
UPDATE "preferences" SET "priorities" = 'biceps,triceps' WHERE "id" = 1;
