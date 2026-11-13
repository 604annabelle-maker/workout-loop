# Workout Loop v2: design

Agreed with her on 13 November 2026, question by question. It replaces
`docs/rebuild-plan.md` and `docs/superpowers/specs/2026-08-26-workout-loop-design.md`.
The evidence behind the training rules is in
[`docs/research/2026-11-progressive-overload.md`](../../research/2026-11-progressive-overload.md).
Where that report and this spec disagree, this spec wins, because it records
what she chose.

## Why a rebuild

Two bugs kept coming back: exercises that did not work the muscle they were
labelled with, and warm-ups that did not match the workout. Both had the same
cause. The model chose the exercises and wrote the warm-up freely, and code
only corrected the numbers afterwards. Nothing checked that an exercise
trained the muscle its slot was for, or that the warm-up was about that day's
muscles. v2 makes both of those checks in code, and a plan that fails them is
never sent.

## What is kept and what is new

**Kept, cleaned up, not redesigned** (none of the bugs came from here, and the
Gmail dynamic email setup was tested on her phone):

- the signed booking webhook and booking payload checks (`signature.ts`, `booking-payload.ts`)
- the delivery pipeline: booked, then generated, then sent, with retries from cron (`delivery.ts`, `cron.ts`)
- the mailbox: SMTP out, IMAP in, reply parsing and matching (`mail-*.ts`, `mailbox.ts`, `reply-parse.ts`, `reply-match.ts`, `replies.ts`)
- the AMP sender check (`amp-cors.ts`) and the per-workout log token
- the Claude call wrapper (`claude.ts`), the database connection and migrations tooling

**Rewritten from scratch:**

- the training engine
- exercise choice and its checks
- the warm-up
- progression
- learning from her comments
- the email in all three versions (dynamic, HTML, text)
- logging
- the weekly summary
- the monthly check-in

The new email's design takes nothing from the old one: no layout, styles,
colours or components.

**Dropped:**

- the old progress history (the new log starts empty)
- the old `program.ts`, `coach.ts`, `plan.ts`, `prompt.ts`, `taps.ts`, `summary.ts`, `workout-mail.ts`, `workout-amp.ts`, `workout-shape.ts`, `exercise-name.ts` and `exercise-pictures.ts`
- cycle tracking and jump days
- easing off after classes: she does not want her classes to affect sessions

## Her setup

- **Schedule:** 4 lifting days a week, about 60 minutes each. Sessions go in
  order, not by weekday, so a missed day shifts the rest and nothing is lost.
- **Goals:** lean muscle and strength, balanced across muscle groups. Arms
  are slightly weaker, so biceps and triceps each get about 2 to 3 more weekly
  sets than the other muscles. This is a small lean, not a priority day.
- **Abs:** a short abs finisher twice a week. No cardio; her classes cover it.
- **Never:**
  - anything braced on a chest pad (chest-supported rows, chest-supported curls)
  - the medicine ball chest pass

  No other injuries or movements to avoid.
- **Starting point:** there are no starting numbers. Week 1 is "find your weight".

## Training rules

All numbers here are defaults in one file, `src/training/rules.ts`. Each
carries its reason and its confidence rating from the research report.

### Weekly structure

- **Split:** Upper / Lower / Upper / Lower. This is the research report's pick
  for 4 days a week: every muscle is trained twice a week, and it fits 60
  minutes. Each upper day carries direct biceps and triceps work. The two
  lower days each end with the abs finisher.
- **Full body every other week:** on alternate weeks, the second lower day is
  a full body day instead. Legs are still trained twice that week, and the
  full body day carries that week's second abs finisher. Weekly volume is
  counted the same way, so the skeleton rebalances the other days to keep
  every muscle in range.
- **Volume:** counted per muscle per week in fractional sets. A set counts 1
  for each primary muscle of its exercise and 0.5 for each secondary muscle.
  Warm-up sets count 0.
  - Start at 10 sets per muscle (biceps and triceps 12 to 13), then grow
    toward 16 (arms 18), never past 20.
  - At most 8 fractional sets per muscle in one session.
  - Each session holds 14 to 20 working sets.
- **Volume growth:** add one weekly set to a muscle only when all its
  exercises progressed over the last 2 weeks without a `hard` tap.

### Effort and reps

| Class | Reps | Stop short of failure by | Rest |
|---|---|---|---|
| Heavy compound (squat, deadlift, bench, row, pull-up, overhead press) | 5 to 8 or 6 to 10 | 1 to 3 reps, never to failure | 2.5 to 3 min |
| Machine compound | 8 to 12 | 1 to 2 reps | 1.5 to 2 min |
| Isolation | 10 to 15 (lateral raises and calves 12 to 20) | 0 to 1 rep; the last set may go to failure | 1 to 1.5 min |

Each card says this in plain words, for example "stop with 2 left in the
tank". It never says "RIR".

### Progression

Double progression, with the tap as an effort check. It runs per exercise
after each logged session. Taps map to effort: `easy` means 3 or more reps
left, `done` means 1 to 2 left, `hard` means none left or reps missed.

1. **Every set at the top of the range:** after `easy` or `done`, go up one
   weight step. After `hard`, stay and repeat.
2. **Inside the range:** after `easy` or `done`, same weight and one more rep.
   After `hard`, same weight, same reps.
3. **A set below the bottom of the range:** the first time, keep the weight.
   The second time in a row, drop the weight about 10% (down to a step that
   exists) and restart at the bottom of the range.
4. **The step is too big:** if the next weight that exists is more than
   about 10% heavier (common with light dumbbells), raise the top of the rep
   range by 3 to 5 first, then jump.
5. **Stall:** three sessions in a row with no gain in weight × reps means drop
   the weight 10% and rebuild. A second stall within 8 weeks means swap the
   exercise for another with the same primary muscle and movement pattern.
6. **First time on an exercise:** no weight is prescribed. The card says "find
   a weight you could lift about 2 more times than this", and the weight she
   records becomes the starting point.
7. **Bodyweight exercises:** progress reps, then the range rises or a harder
   variation takes over (for example assisted pull-up, then band, then full).

**What counts as logged:**

- The weight and reps on the card when she taps are what she did.
- Not tapped means nothing is assumed, and the exercise does not progress.
- The last tap counts.

### Deloads

Reactive, not on a calendar, because the evidence for fixed deloads is thin.

- **When:**
  - two or more exercises regress in the same week, or
  - 60% or more of the taps across two sessions in a row are `hard`, or
  - she says she is worn out.
- **If none of that happens:** no deload. There is no deload on a schedule.
- **A deload week:** the same exercises and weights, half the sets, and stop
  3 to 4 reps short. Nothing progresses that week.

### Exercises stay long enough to progress

- **Big lifts** (the heavy compounds) stay for a long time and change only
  on a second stall or when she complains.
- **Small exercises** rotate every 4 to 6 weeks, or straight away when she
  complains.
- **Bodyweight exercises** appear now and then: at most one per session, and
  only where one fits the slot.

## Exercise choice and the checks

### The catalogue

`assets/exercises/catalogue.json` is built by a vendor script from
free-exercise-db's metadata (about 870 exercises). Each exercise has:

- primary and secondary muscles, and equipment
- `class` and movement `pattern`
- whether it loads the muscle in a stretched position
- its pictures

**The tags are not trusted blindly.** free-exercise-db's muscle tags are
coarse and sometimes wrong, and wrong tags would bring the old bug back. They
are corrected once, at build time, from anatomy and the research, and never
by her: she does none of this.

- **Review at build time:** every exercise usable with typical gym equipment
  gets its primary and secondary muscles, class, pattern and stretched-position
  flag reviewed against joint actions and the research report's mapping table.
  Corrections go into `assets/exercises/overrides.json`, each with a one-line
  reason.
- **Anatomy rules in code:** tests check the whole catalogue against rules that
  must always hold. For example, a leg curl is primary hamstrings, a row is
  never primary chest, an overhead extension is primary triceps, and a hip
  thrust is primary glutes. A tag that breaks a rule fails the build.
- **Only reviewed exercises can be chosen.** An exercise not reviewed at build
  time is not offered to the model at all.

### How a session is planned

1. **Code builds the skeleton.** It decides the day (upper or lower), which
   slots it has, each slot's target muscle, class, set count and rep range,
   and the weekly volume left to fill. The skeleton is pure and tested.
2. **The model fills each slot** from candidates code has already filtered.
   Candidates must have the slot's muscle as primary, match the slot's class,
   use equipment she has, not be banned, and be allowed by her comment memory.
   - The model reasons from the research summary in its prompt, for example
     preferring stretched-position exercises.
   - It returns catalogue IDs, never free text, plus one swap per exercise
     from the same candidate list.
3. **Code checks the filled plan.** Every slot must be a catalogue ID that
   trains the slot's muscle as primary. The swap must train the same muscle.
   The weekly volume per muscle must land in range, with nothing banned and
   nothing her memory rules out. A plan that fails is sent back to the model
   with the reasons, up to twice. After that, code fills the failing slots
   with the best-ranked candidate itself. A plan that fails the checks is
   never emailed.
4. **Code adds the numbers:** weight, reps, rest and the effort line, from
   progression. The model never sets a number.

### The warm-up

The warm-up is built from the finished plan, never written separately.

1. **3 to 4 warm-up exercises:** easier versions, bodyweight or very light,
   for the muscles the session's first exercises train.
   - They come from the catalogue: bodyweight or band, class isolation or
     drill.
   - Each one must have a primary muscle that today's working exercises
     train. Code checks this, so a warm-up can never be about other muscles.
   - About 10 reps each, no static holds of 30 seconds or more.
2. **One light practice set** of the first heavy lift before its working sets,
   at about 50% for 8 reps. Weights are rounded to steps that exist.
3. **Total:** 8 to 12 minutes. None of it counts toward volume.

## Learning from her comments

Her comments arrive from the end-of-email box or from a reply. Each is read by
the model into structured notes. Each note says which exercise it is about
(or the whole session) and one of these reasons:

| Reason | Example | What the app does |
|---|---|---|
| `wrong_muscle` | "didn't feel it in my glutes" | Swap it next time for a different exercise with the same muscle; remember that this exercise misses for her |
| `pain` | "hurt my knee" | Swap it next time and note it. It can come back later. She may write "hurt" for a burn, so this is never a ban |
| `too_hard` | "couldn't keep form" | An easier variation, or a lighter weight |
| `too_easy` | "way too light" | Raise the weight now, without waiting for the rep rule |
| `dislike` | "hated it" | Never choose it again |
| `one_off` | "machine was taken" | No change |
| `liked` | "loved these" | Prefer it when it fits |

- The notes live in a `memory` table and are included in every planning
  prompt.
- Code applies `dislike` as the only hard filter, so the model cannot
  overrule it. Every other reason is guidance.
- When the app acts on a note, the next email shows one line saying so, for
  example "Swapped hip thrust for glute bridge, since you said you didn't feel
  it".

## Weights that exist

She enters her gym's equipment once on the preferences page (computer only):

- the dumbbell weights
- the barbell and plates
- each machine's weight steps
- bands, cables and benches

The app only ever suggests a weight that can actually be loaded, and the − / +
buttons move between those steps.

## The email

### What it holds, in order

1. **One header line:** "Upper · 55 min · 6 exercises".
2. **One line per change the AI made because of her comments**, when there is
   one.
3. **The warm-up card:** the warm-up exercises, then the one light practice
   set.
4. **One compact card per exercise:**
   ```
   Romanian deadlift · hamstrings
   3 × 8   [−] 40 kg [+]   [−] 8 reps [+]
   stop with 2 left · rest 2½ min
   [ easy ] [ done ] [ hard ]      swap ▾   how to ▾
   ```
   - The weight and reps are filled in. The − / + buttons move them, and
     nothing is ever typed.
   - Tapping easy, done or hard saves the exercise with the numbers shown.
   - **Swap** opens in place with the swap exercise and its own numbers.
   - **How to** opens a picture and one line on form.
   - On a first-time exercise, the weight shows "find it" until she sets it.
5. **The abs finisher**, as cards, on lower days.
6. **"Anything about today?"**, a comment box, then **All done**, which marks
   every untapped card as done.
7. **The weekly summary:** sets per muscle this week against the target. It
   starts over each Sunday.

### Versions

- **Dynamic (AMP):** − / + uses `amp-bind` state, and each easy / done / hard
  button submits an `amp-form` to `/api/log` with the exercise, weight, reps
  and tap. The tests check it against the AMP for Email rules, because Gmail
  silently falls back to the plain version on any break.
- **Plain HTML, and plain text wrapped to 50 characters:** the same content,
  with no buttons. These are logged by replying with "done", or only what was
  different: "RDL 42.5 8 8 7 hard".

### The monthly check-in

A separate dynamic email on the first Sunday of each month, with three quick
taps and an optional comment:

- **Enjoying it?** yes / meh / no
- **Session length?** too short / right / too long
- **Anything to change?** a free comment

The answers become memory notes and can change session length or exercise
variety.

## Data

Four new tables:

- `exercise_log`: one row per exercise per session, with catalogue ID,
  weight, reps per set, tap, and whether it was the swap.
- `memory`: the structured notes from her comments.
- `equipment`: the steps that exist.
- `checkins`: the monthly answers.

`workouts` keeps its delivery columns and stores the checked plan as JSON.
Old history is left in place but never read.

## Rollout

The new app sends sample emails first, marked `preview`, that never count as
training. It replaces the old app only after she approves the sample on her
phone.

## Testing

Pure modules are tested with Node's runner, as before. The heaviest coverage
goes where a mistake would be silent:

- **The plan checker:** a wrong-muscle exercise, a wrong-muscle swap, a
  warm-up exercise for an untrained muscle, a banned exercise, or volume out
  of range must all fail.
- **Progression:** every row of the rules above.
- **Weight steps:** every suggested weight must exist.
- **Comment memory:** each reason has its effect, and `dislike` cannot be
  overruled.
- **Catalogue tags:** the anatomy rules hold for every exercise that can be
  chosen.
- **Skeleton:** the full body week alternates, and every muscle stays in its
  volume range in both kinds of week.
- **The dynamic email:** checked against the AMP rules.
- **Pipeline:** an end-to-end test from a booking to an email, with a canned
  model.

## Out of scope

- the old design, and the old progress history
- programming by menstrual cycle
- any link or web page she would need to open on her phone
- adjusting for her classes
- cardio sessions
