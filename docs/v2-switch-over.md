# Switching to v2

**v2 is live since 17 November, on her go-ahead.** It is on by default; setting
`PLAN_VERSION=1` in Vercel switches bookings back to the old app. The steps
below are how it got there.

The rebuild (spec: `docs/superpowers/specs/2026-11-13-workout-loop-v2-design.md`).

## 1. Deploy

Merging deploys as usual. `vercel-build` applies migration `0005_v2_training`,
which only adds tables and two columns; the old app does not notice it.

## 2. Send her a sample

What it looks like: [`v2-email-preview.png`](v2-email-preview.png) (rendered in a browser, sections open).

Actions tab, **Preview the workout email**, version `2`. She gets a v2
email marked "Preview". Its buttons work, but a preview is never read as
training. On her phone she checks:

- − / + on weight and reps, and tapping the weight for the row of nearby weights
- easy / done / hard / skip on a few cards, with nothing picked to start; on one, open Swap and tick "did this instead"
- How to (the sketch and one line)
- a comment, then the one Save at the bottom: it says what it saved
- the line at the top changing from "Nothing logged yet"

## 3. Her gym

On the preferences page (computer), **Your gym**: dumbbells, plates, cable
and machine steps, and any machine the gym does not have. Until then a
typical gym stands in.

## 4. Switch on

Done in code: v2 is the default. From the next booking, workouts
are v2. A workout already planned the old way finishes the old way. The
monthly check-in starts going out on the first Sunday of the next month.

## Switching back

Set `PLAN_VERSION=1`. v2 workouts already sent keep logging to v2; new
bookings go through the old app. Nothing is lost either way.
