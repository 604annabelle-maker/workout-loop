# Workout Loop v2: build plan

**Design:** [`../specs/2026-11-13-workout-loop-v2-design.md`](../specs/2026-11-13-workout-loop-v2-design.md)
**Research:** [`../../research/2026-11-progressive-overload.md`](../../research/2026-11-progressive-overload.md)
**Branch:** `claude/amazing-meitner-r2wbr1`. Nothing reaches `main` until she
approves a sample on her phone (stage 12).

## Shape of the plan

Fourteen stages, 0 to 13. Each one ends in something that can be checked, not
just code that compiles.

**The parts that caused the old bugs come first, built pure and tested with
no API key, mailbox or database:**

- the catalogue and its anatomy rules
- the plan checker
- the warm-up generator

The old app keeps running untouched on `main` the whole time.

**Layout:**

- New code goes in `src/training/` (pure rules), `src/email/` (the three
  email versions) and `src/memory/` (comment notes).
- Kept plumbing stays in `src/lib/`.
- Old training and email modules are deleted in stage 13, once nothing
  imports them.

**Credentials,** needed at these points and nowhere earlier:

| Stage | Needs |
|---|---|
| 2 | Network access to `raw.githubusercontent.com`, to vendor free-exercise-db once |
| 4, 7 | `ANTHROPIC_API_KEY`, only to see real choices instead of the canned filler |
| 8 | A database (local Postgres is fine) |
| 12 | The workout mailbox and her phone, for the sample |

---

## Stage 0: Make room

- Create `src/training/`, `src/email/` and `src/memory/`, each with a
  short README naming what lives there.
- Change `npm test` to `tsx --test 'src/**/*.test.mts'` so the new folders
  are included, with the glob quoted.
- Mark the old modules as legacy in a comment at the top of each. Nothing
  else changes yet.

**Done when:** `npm test` and `npm run typecheck` pass with both old and new
folders in place.

---

## Stage 1: Rules and weights that exist (pure)

**`src/training/rules.ts`:** every number in the spec's training rules, each
with its reason and confidence rating:

- rep ranges, effort and rest per class
- volume targets and caps, with the arm lean (+2 to 3 sets)
- progression thresholds and deload triggers
- warm-up timings

**`src/training/equipment.ts`:**

- An `Equipment` type covering:
  - dumbbell weights
  - barbell weight and plates (pairs)
  - one step list per machine or cable
  - whether bands and benches are there
- `DEFAULT_EQUIPMENT`: a typical commercial gym, used until she corrects it.
- `loadable(kind, equipment)`: the sorted list of weights that exist for that
  kind of equipment.
- `stepUp`, `stepDown`, `nearest`, `neighbours(weight, 3)` (for the
  tap-a-weight row), and `roundDown`.
- `label(kind)`: "each hand", "total with bar", "on the stack" or
  "bodyweight".

**Tests:**

- Every value returned is in `loadable`.
- A barbell's loadable list is the bar plus symmetric plate pairs.
- `neighbours` at the bottom and top of a list.
- The step-too-big detection (more than 10%) used by stage 5.

**Done when:** tests pass, and no function returns a weight that isn't in
`loadable`.

---

## Stage 2: The catalogue, reviewed

**`src/scripts/vendor-catalogue.mts`:**

- Downloads free-exercise-db's `dist/exercises.json`.
- Maps its muscles onto ours: quads, hamstrings, glutes, chest, back,
  side delts, front delts, rear delts, biceps, triceps, calves, abs,
  adductors.
- Writes `assets/exercises/raw.json`.
- Pictures are already vendored in `assets/exercise-pictures`; the script
  links them by ID.

**`assets/exercises/overrides.json`**, written by hand at build time from
anatomy and the research report's mapping table:

- Covers every exercise usable with gym equipment, bodyweight or bands.
- Each entry sets `primary`, `secondary`, `class` (heavy compound, machine
  compound, isolation, warm-up drill), `pattern`, `stretched`, `equipment
  kind`, and `reviewed: true`, with a one-line `why` wherever it changes the
  raw tags.
- Bans: anything braced on a chest pad, and the medicine ball chest pass.
- She does none of this.

**`src/training/catalogue.ts`:**

- Merges raw and overrides into `catalogue()`.
- Exposes only reviewed, unbanned exercises.
- Lookups by ID, muscle, class, pattern and equipment kind.

**`src/training/anatomy.test.mts`:** the rules that must hold for every
exercise that can be chosen. Any tag breaking one fails the build.

- Leg curls are primary hamstrings.
- Leg extensions are primary quads.
- Hip thrusts and glute bridges are primary glutes.
- Rows and pulldowns are primary back with secondary biceps, and never
  primary chest.
- Presses carry secondary triceps.
- Overhead triceps extensions are primary triceps, and stretched.
- Lateral raises are primary side delts.
- No banned exercise is reachable.
- Every muscle has at least 3 reviewed exercises in each class it needs, plus
  at least 2 bodyweight warm-up drills.

**Done when:**

- The anatomy tests pass on the whole reachable catalogue.
- A printed coverage table (muscle × class) has no empty cell that the
  skeleton needs.

---

## Stage 3: The week's skeleton (pure)

**`src/training/skeleton.ts`:**

- `nextSession(history)`: Upper A, Lower A, Upper B, then Lower B. On
  alternate weeks, Full body replaces Lower B. Sessions go in order, not by
  weekday. A week is counted Sunday to Saturday.
- `skeleton(sessionType, weekVolumeSoFar, rules)`: the slots, each with a
  target muscle, class, set count and rep range.
  - It aims each muscle at its weekly target and never puts more than 8
    fractional sets of a muscle in one session.
  - Each session has 14 to 20 working sets.
  - The abs finisher goes on Lower A, and on Lower B or Full body.
  - Arms go on both upper days (and in full body).
- Deload weeks halve the sets.

**Tests:**

- For every week type (normal, full body, deload), simulate four sessions:
  each muscle lands in its range, arms sit about 2 to 3 sets above the
  others, and no session breaks a cap.
- A missed session shifts the order and loses nothing.

**Done when:** those simulations pass for 12 straight weeks.

---

## Stage 4: Filling the slots, and the checker

**`src/training/candidates.ts` (pure):** for each slot, the reviewed exercises
that pass every filter:

- the slot's muscle is primary
- the class matches
- the equipment exists
- not banned
- not disliked (from memory)
- not mid-rotation, so big lifts keep their exercise and small ones rotate on
  schedule

Candidates are ranked: stretched first, then liked, then familiar. At most 2
new exercises per session, and at most 1 bodyweight exercise, only where one
fits the slot.

**`src/training/check.ts` (pure):** `checkPlan(plan, skeleton, memory)`
returns a list of failures. A plan fails when any of these happens:

- an ID is not in the catalogue
- an exercise doesn't train its slot's muscle as primary
- a swap trains a different muscle
- a warm-up exercise's primary muscle is not one today's working exercises
  train
- weekly volume falls out of range
- anything banned or disliked appears
- more than 2 new exercises, or more than 1 bodyweight exercise, appear

**`src/training/choose.ts`:**

- Asks the model through the existing `claude.ts` wrapper.
- The prompt carries the skeleton, the candidate IDs with their tags, a
  short research summary and the memory notes.
- The answer is JSON in a schema: one ID and one swap ID per slot, plus one
  line on why for each.
- On failures, it sends them back with the reasons, up to twice. After that,
  code fills the failing slots with the top-ranked candidate.
- Without an API key, code fills every slot.

**Tests** (with a stubbed model):

- A wrong-muscle answer is rejected, re-asked, then filled by code.
- A disliked exercise never ships.
- The fallback always passes `checkPlan`.

**Done when:** for 200 random histories, the plan that comes out always
passes `checkPlan`, whatever the stub answers.

---

## Stage 5: Progression and the numbers (pure)

**`src/training/progress.ts`:** implements the spec's rules exactly:

- Taps map to effort.
- Top of the range: go up a step. Inside the range: add a rep. Below the
  bottom twice: drop about 10%.
- When the next weight is more than 10% heavier, raise the rep range first.
- Stall resets, and a swap on the second stall.
- First time on an exercise: "find it".
- Bodyweight exercises progress by reps, then by variation.
- An untapped exercise means no change, and the last tap counts.

**`src/training/prescribe.ts`:** turns a checked plan into cards: weight
(always a step that exists), its label, reps, sets, rest, and the effort line
in plain words ("stop with 2 left in the tank").

**`src/training/deload.ts`:** the reactive triggers only. There is no
scheduled deload.

**Tests:** one per rule row, plus:

- All prescribed weights are loadable.
- The effort line never contains "RIR".
- A deload is never scheduled without a trigger.

**Done when:** every rule in the spec's progression list has a named test.

---

## Stage 6: The warm-up (pure)

**`src/training/warmup.ts`:** `warmup(plan)`.

1. Picks 3 to 4 bodyweight or band drills whose primary muscle is trained by
   the session's first exercises. It prefers drills that match the first
   lift's movement pattern, with about 10 reps each and no static holds.
2. Adds one light practice set of the first heavy lift: about 50% for 8
   reps, rounded to a weight that exists.
3. Keeps the total to 8 to 12 minutes.

**Tests:**

- For every session type and 200 random plans, every drill's primary muscle
  is trained that day, so `checkPlan` passes.
- The practice set uses the first heavy lift and a loadable weight.
- Warm-up sets never count toward volume.

**Done when:** those tests pass.

---

## Stage 7: Memory from her comments

**`src/memory/read.ts`:**

- The model reads a comment (from the email box or a reply) into notes:
  exercise ID or session, and reason. The reasons are `wrong_muscle`, `pain`,
  `too_hard`, `too_easy`, `dislike`, `one_off` and `liked`.
- Without a key, a small keyword reader handles the obvious cases.

**`src/memory/apply.ts` (pure):** each reason's effect, as in the spec's
table:

- `dislike` is the only hard filter.
- `pain` swaps it next time and never bans it.
- `too_easy` raises the weight now.

It also writes the "Swapped X because you said Y" lines for the next email.

**Undo:** `undoNote(id)` deletes a note. If the note caused a swap, the
original exercise is restored next session.

**Tests:**

- Every reason has its effect.
- `pain` never bans.
- `dislike` can't be overruled by the model.
- Undo restores the original exercise.
- "it hurt, good burn" is not read as a ban.

**Done when:** those tests pass.

---

## Stage 8: Data

**Drizzle migration**, which only adds tables and columns:

- `exercise_log`: one row per workout and exercise, with catalogue ID,
  weight, reps per set, tap, whether the swap was used, and when.
  Unique on (workout, exercise slot), so the last tap overwrites.
- `memory`: one row per note, with reason, exercise ID, source text, created
  date and an undo date.
- `equipment`: one row holding the JSON `Equipment`.
- `checkins`: monthly answers. Unique on month.
- On `workouts`: `version` (1 or 2) and `plan_v2` as JSON.

**Readers and writers:**

- `src/training/history.ts`: reads the last 16 weeks of v2 logs into the
  shapes stages 3 to 7 use. v1 history is never read.
- The equipment form on the existing preferences page. It is
  computer-only, and prefilled with `DEFAULT_EQUIPMENT`.

**Done when:** the migration applies to a local Postgres, and a round trip
(write a log, read the history) passes.

---

## Stage 9: The email, designed from scratch

**`src/email/`:**

- `cards.ts`: the content model for one email, shared by all three versions.
- `amp.ts`: the dynamic version.
- `html.ts` and `text.ts`: the plain versions. Text is wrapped to 50
  characters and logged by reply.

The design is new: type, spacing, colour and components. It is built for a
narrow phone first, with no frame.

**Content, in the spec's order:**

1. The header line.
2. The change lines, each with an undo tap.
3. The warm-up card.
4. The exercise cards. Each has:
   - − / + on weight and reps
   - a weight label
   - a tap on the weight that opens the nearby weights row
   - easy / done / hard
   - swap ▾, with the swap's own numbers
   - how to ▾, with a picture and one form line
   - "find it" on first-time exercises
5. The abs finisher.
6. The comment box and **All done**.
7. The weekly summary, which starts over each Sunday.

**AMP mechanics:**

- `amp-state` holds each card's weight and reps.
- − / + and the nearby weights row use `amp-bind` and move only through the
  card's list of weights that exist.
- Each easy / done / hard is an `amp-form` submit to `/api/log` carrying the
  token, slot, weight, reps and tap.
- `submit-success` and `submit-error` templates show "saved" or "not saved,
  tap again".

**Tests:**

- The validator: every generated dynamic email passes `amphtml-validator` in
  AMP4EMAIL mode. Add it as a dev dependency.
- The same content shows in all three versions.
- No links.
- Every weight shown is loadable and labelled.

**Visual check:**

- `npm run preview:email` renders sample emails to HTML.
- Playwright screenshots them at phone width (390px) for review before
  anything is sent.

**Done when:** the validator passes, and the phone screenshots have been
reviewed.

---

## Stage 10: Logging in, from taps and replies

**`/api/log`, rewritten for v2:**

- Checks the AMP sender (`amp-cors.ts`, kept) and the workout's token.
- Each tap upserts its `exercise_log` row with the numbers on the card.
  `all_done` marks every untapped slot done.
- The comment box writes a feedback row, and `memory/read` runs on it after
  the response.
- `undo` deletes a note.

**Reply shorthand** (`src/email/reply.ts`):

- Reads "done", or only what was different: "RDL 42.5 8 8 7 hard", or
  "swap leg press".
- Exercise names are matched against that workout's own cards only.
- Free text goes to `memory/read`.

**Tests:**

- Taps from the same card overwrite.
- A wrong token or sender gets no answer.
- The shorthand cases.
- A quoted previous email is never read as her words (the existing
  `reply-parse.ts` covers this).

**Done when:** a scripted run (send, tap three cards, all done, comment)
produces the right logs and notes.

---

## Stage 11: Weekly summary and monthly check-in

- `src/training/summary.ts` (pure): sets per muscle since Sunday, against
  target, as rows the email shows.
- `src/email/checkin.ts`: the monthly dynamic email with three taps and a
  comment.
  - The cron sends it on the first Sunday of each month. A unique month in
    `checkins` makes it once-only.
  - The answers become memory notes. "Too long" or "too short" changes the
    session's set budget.

**Tests:**

- The summary starts over on Sunday.
- The check-in sends once a month.
- "Too long" shrinks the set budget.

**Done when:** those tests pass.

---

## Stage 12: Wiring, and the sample on her phone

- `deliverWorkout` (kept) calls the v2 pipeline behind a `PLAN_VERSION=2`
  switch: history, then skeleton, candidates, choose and check, prescribe,
  warm-up, the email, and send.
- Retries, idempotency and the booking webhook are unchanged.
- The existing preview workflow sends v2 samples marked `preview`, which
  never count as training.
- An end-to-end test runs from a booking to an email, with a canned model and
  the console mailer.

**Her check, on her phone:**

1. A sample dynamic email arrives.
2. She taps − / +, the weights row, swap, how to, easy / done / hard, a
   comment, undo and all done.
3. Every action saves and shows "saved".
4. She approves, or asks for changes.

**Done when:** she approves the sample.

---

## Stage 13: Switch over and clean up

- Set `PLAN_VERSION=2` in production. Merge to `main` only with her
  go-ahead.
- Delete the legacy modules and their tests:
  - `program`, `coach`, `plan`, `prompt` and `progress` (the old one)
  - `taps`, `summary`, `workout-mail`, `workout-amp` and `workout-shape`
  - `exercise-name`, `exercise-pictures` and `reply-log`
  - and `assets/exercise-drawings`, if no v2 card uses it
- Rewrite the README around v2, leading with the loop diagram.
- Retire the old docs: mark `docs/rebuild-plan.md` and the old research docs
  as superseded.

**Done when:** `npm test`, `npm run typecheck` and the build are clean with
the legacy code gone, and the first real booked session goes out as v2.
