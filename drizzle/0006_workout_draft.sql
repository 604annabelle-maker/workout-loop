ALTER TABLE "workouts" ADD COLUMN "draft" jsonb;--> statement-breakpoint
-- Her plates and dumbbells, from her replies of 19 and 20 November 2026:
-- plates of 10, 7.5 and 5 kg; dumbbells every kilo to 10, then 12.5 to 30 in
-- 2.5s. Set on the saved equipment too, if she has saved any; still editable
-- on the gym page.
UPDATE "equipment" SET "data" = jsonb_set(jsonb_set("data", '{plates}', '[5, 7.5, 10]'::jsonb), '{dumbbells}', '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30]'::jsonb), "updated_at" = now() WHERE "id" = 1;
