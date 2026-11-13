# Switching to v2

The rebuild (spec: `docs/superpowers/specs/2026-11-13-workout-loop-v2-design.md`)
is in the code behind one setting. Until it is switched on, bookings go
through the old app exactly as before.

## 1. Deploy

Merging deploys as usual. `vercel-build` applies migration `0005_v2_training`,
which only adds tables and two columns; the old app does not notice it.

## 2. Send her a sample

Actions tab, **Preview the workout email**, version `2`. She gets a v2
email marked "Preview". Its buttons work, but a preview is never read as
training. On her phone she checks:

- − / + on weight and reps, and tapping the weight for the row of nearby weights
- easy / done / hard on a card, then on a swap; each shows "Saved"
- How to (a photo and one line), Swap
- a comment, then All done
- the line at the top changing from "Nothing logged yet"

## 3. Her gym

On the preferences page (computer), **Your gym**: dumbbells, plates, cable
and machine steps, and any machine the gym does not have. Until then a
typical gym stands in.

## 4. Switch on

Set `PLAN_VERSION=2` in Vercel and redeploy. From the next booking, workouts
are v2. A workout already planned the old way finishes the old way. The
monthly check-in starts going out on the first Sunday of the next month.

## Switching back

Unset `PLAN_VERSION`. v2 workouts already sent keep logging to v2; new
bookings go through the old app. Nothing is lost either way.
