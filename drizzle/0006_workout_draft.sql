ALTER TABLE "workouts" ADD COLUMN "draft" jsonb;--> statement-breakpoint
-- Her plates, from her reply of 19 November 2026: 10, 7.5 and 5 kg. Set on
-- the saved equipment too, if she has saved any; still editable on the gym page.
UPDATE "equipment" SET "data" = jsonb_set("data", '{plates}', '[5, 7.5, 10]'::jsonb), "updated_at" = now() WHERE "id" = 1;
