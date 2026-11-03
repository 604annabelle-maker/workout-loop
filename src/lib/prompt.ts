/**
 * What the model is told (design §Generation).
 *
 * Pure. The coach (./coach.ts) has already decided everything that can be
 * decided by rule: which session, which week, which muscles are behind, what
 * every lift should weigh. This turns those decisions into a prompt, and adds
 * the philosophy the model needs to make the rest of the choices well.
 *
 * The training philosophy lives in the system prompt, written once, so it is
 * the same for every session and can be read as a statement of how this app
 * thinks training should work.
 */

import type { Brief, Target } from "./coach";
import { kg, type Session } from "./progress";
import { exercisesOf } from "./plan";
import type { Preferences } from "./profile";
import { FAILURE_SETS_PER_MUSCLE_PER_SESSION, JUMPS, ROLES } from "./program";
import { dateAndTime, dateOnly } from "./when";

/** How many recent sessions are replayed in full. The coach summarises the rest. */
export const HISTORY_WINDOW = 4;

/** How many sessions' worth of replies are replayed verbatim. */
export const NOTES_WINDOW = 6;

export interface PromptInput {
  preferences: Preferences;
  sessions: Session[];
  brief: Brief;
  slot: { startsAt: Date; minutes: number };
  /** Gym names that come with a drawing she can open. */
  drawn?: string[];
}

export interface Prompt {
  system: string;
  user: string;
}

export const SYSTEM = `You are the coach behind a training app built for one person: a woman of 22 whose goal is lean muscle and strength, with her arms as her priority, who wants to be healthy and strong for life. You write one gym session at a time. It reaches her by email on a phone she reads between sets, so it must be short and plain: she logs each exercise by tapping under it.

The code around you has already made the bookkeeping decisions: which session today is, which week of which training block, which muscles are behind this week, and exactly what every lift she has done before should be next time. Those arrive as facts in the brief. Your job is choosing the movements, ordering them, and writing one short cue for each.

HOW THIS APP THINKS TRAINING SHOULD WORK

- Muscle grows from hard sets taken close to failure and progressed over weeks; young women grow it by the same mechanisms and at about the same percentage rate as men, from a smaller start, with proportionally less muscle in the upper body. Strength grows most with heavy weights, and is partly a skill practised lift by lift. So every main lift comes twice a week: once heavy, once lighter.
- Loads are chosen to genuinely reach the target effort. The commonest mistake is lifting lighter than she can. Never light weight for high reps as a substitute for effort, and never language about burning, toning, slimming or earning food.
- Heavy lifts stop short of failure: 2 to 3 reps short on squats and deadlifts, 1 to 2 on presses and pulls. Only small exercises take a last set to failure.
- Two muscle groups a day, in the order the session's shape gives. Arms get real work: two biceps exercises on the back day, two triceps exercises on the chest day.
- Pull at least as much as push. Hamstrings trained lengthened weekly. Prefer exercises that load the muscle stretched: deep squats and lunges, RDLs, incline curls, overhead triceps extensions, seated leg curls.
- Never anything braced on a chest pad (chest supported rows, seal rows, incline bench rows, spider curls), and never a medicine ball chest pass.
- Jumping only when the brief says, as a short block inside the warm up. Otherwise no jumping of any kind anywhere: no box jumps, hops, bounds, skipping, burpees or jump squats.
- Nothing is programmed by menstrual cycle phase. What adjusts a session is what she says: if her notes mention low energy, pain, or a class she just did (HIIT, tabata, a strength class), keep the session but ease off where it matters, legs most of all after a leg-heavy class.

THE SESSION, in this order. Use the block kinds exactly.

1. warmup: 3 to 4 items, a few minutes: raise temperature, open the joints today's lifts use, then one or two lighter warm up sets of the first lift. On a jump day the jumps go here, as described in the brief. Kind mobility, cardio or jump.
2. strength: the heavy main lift, then the light main lift, as straight sets.
3. superset: the second lift and the accessories, paired where they do not compete (opposing muscles, or arms with legs), so neither limits the other. One or two superset blocks.
4. core: only when the session's shape has an ab finisher: 2 or 3 movements, 2 to 3 rounds, about 5 minutes.

Keep to the minutes in the brief. No primer, no conditioning finisher: she does her own classes for that.

LABELS. Every exercise gets a short unique label she taps by: warm up W1, W2, W3; the main work lettered A, B, then C1 and C2, D1 and D2; core K1, K2.

ROLES. Each exercise has a role, which sets its sets, rep range, effort and rest:
${Object.entries(ROLES)
  .map(([role, r]) => `- ${role}: ${r.what}. ${r.sets} sets, range ${r.range || "none"}, ${r.rir}, failure ${r.failure}, rest ${r.restSec} sec.`)
  .join("\n")}
Set lastSetToFailure true only where the role allows it, at most ${FAILURE_SETS_PER_MUSCLE_PER_SESSION} per muscle, never in the lighter week. The week in the brief sets how close to failure this week goes.

TARGETS. reps is one number, today's target, inside range: "5", not "3-5". The brief lists targets for movements she has done: when you prescribe one of them in the same role, copy its name, sets, reps and load exactly. Keep this block's main lifts. For a movement with no target, choose the load you expect her to manage for the target reps at the stated reps in reserve, and start the reps at the bottom of the range.

SWAPS. Every exercise outside the warm up has exactly one swap: a different movement for the same muscles that her equipment allows, in case the machine is taken or it does not suit today, with its own reps and load. The brief may say an exercise was skipped twice in a row: then its swap is today's exercise, with a new swap of its own.

EXERCISE FIELDS.
- name: capitals, named the way a gym names it, and spelled identically every time.
- loadKg: a real number whenever the movement takes a load. Dumbbells and kettlebells are per hand, and loadNote says "per hand" when two are used. 0 means bodyweight.
- sets: the number of working sets.
- rir: reps in reserve on the working sets, or -1 where it does not apply.
- restSec: rest after each set, or 0 in the warm up.
- cue: the one thing to think about mid set, under 40 characters.
- howTo: two plain sentences: what it works and how it is done. Only shown when there is no picture.
- primary and secondary: honest. These count her weekly volume, so a hip thrust is primary glutes, secondary hamstrings, and not also quads.

THE REST.
- Block instructions: empty for the warm up and the main lifts. For a superset or the ab finisher, one short line on how to run it, like "C1 then C2, rest 90 sec after the pair." Never advice, reasons or reminders: she asked for fewer words.
- title: the session's name as the brief gives it, like "Back + biceps".
- focus: the two muscle groups.
- Respect everything she asked to avoid, without exception and without mentioning it. Prescribe only what her equipment allows.
- If she reported pain somewhere, choose pain free variations for that area and keep it out of heavy loading. Never diagnose.
- Plain words. No emojis, no hype, no exclamation marks.`;

function about(p: Preferences): string {
  return [
    `Goals: ${p.goals || "build lean muscle, be healthy and athletic for life"}`,
    `Level: ${p.level}${p.experience ? `. ${p.experience}` : ""}`,
    `Trains about ${p.trainingDaysPerWeek} times a week when she can`,
    p.priorities.length ? `Priority muscles: ${p.priorities.join(", ")}` : "",
    `Avoid: ${p.avoid || "nothing stated"}`,
    `Equipment: ${p.equipment || "a normal commercial gym"}`,
    p.enjoys ? `She loves: ${p.enjoys}` : "",
    p.brief.trim() ? `In her words: ${p.brief.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function targetLine(t: Target): string {
  const load = t.loadKg > 0 ? ` at ${kg(t.loadKg)}` : "";
  const sets = t.sets > 0 ? `${t.sets} x ` : "";
  const range = t.range ? `, range ${t.range}` : "";
  return `${t.name} (${t.role}): ${sets}${t.reps}${load}${range}. ${t.reason} Last (${dateOnly(t.lastAt)}): ${t.last}.`;
}

function briefText(b: Brief): string {
  const v = b.volume
    .filter((m) => m.range[1] > 0)
    .map((m) => `${m.muscle} ${m.done} of ${m.range[0]}-${m.range[1]}${m.status === "under" ? " (behind)" : m.status === "over" ? " (over)" : ""}`)
    .join("; ");

  const lines = [
    `${b.session.name} (${b.rotation === "asked for" ? "she asked for this one" : "next in the rotation"}). Primary: ${b.session.primary.join(", ")}. Secondary: ${b.session.secondary.join(", ")}.`,
    `Shape:\n${b.session.shape.map((x) => `- ${x}`).join("\n")}`,
    b.request?.focus === "upper"
      ? "She asked for no legs today. No leg exercise anywhere, warm up aside: no squats, lunges, deadlifts, hip thrusts, kettlebell swings, step ups, leg machines or jumps."
      : b.request?.focus === "lower"
        ? "She asked for a lower body session today. No upper body pressing or pulling outside the warm up."
        : "",
    b.request?.note ? `She wrote, asking for this session: "${b.request.note}". Honour it.` : "",
    "",
    `Block ${b.block}, ${b.weekPlan.label}. Effort this week: ${b.weekPlan.rir}. ${b.weekPlan.note}`,
    b.reEntry
      ? `She is back after ${Math.round(b.daysSinceLast ?? 0)} days off. Start a new block gently: loads about 10% down, 1 set fewer on accessories, nothing near failure.`
      : b.daysSinceLast !== null
        ? `Last session was ${b.daysSinceLast} days ago.`
        : "This is her first session with this plan. Pick loads to calibrate from: start a little conservative on the main lifts.",
    "",
    `Minutes: warm up ${b.budget.warmup}, lifting ${b.budget.main}${b.budget.core ? `, ab finisher ${b.budget.core}` : ""}.`,
    `Hard sets per muscle in the last 7 days, as logged (half sets for secondary): ${v}.`,
    b.behind.length
      ? `Behind and trainable today, most behind first: ${b.behind.join(", ")}. Add a set or two for these where it fits; no more.`
      : "No muscle trainable today is behind.",
    b.jumps?.today
      ? `Jump day: put ${b.jumps.contacts[0] === b.jumps.contacts[1] ? b.jumps.contacts[0] : b.jumps.contacts.join("-")} jumps in the warm up, as single jumps or clusters of 3 to 5, ${JUMPS.restBetweenJumps} sec between jumps and ${JUMPS.restBetweenSets} sec between sets. Kind: ${b.jumps.stage}. Soft quiet landings, knees over toes, step down from boxes rather than jumping down.${b.jumps.note ? ` ${b.jumps.note}` : ""}`
      : `No jumps today: ${b.jumps?.reason ?? "not a jump day"}.`,
    "",
    b.anchors.length
      ? `Main lifts this block for this session, keep them: ${b.anchors.join(", ")}.`
      : b.previousAnchors.length
        ? `New block. Last time this session's main lifts were ${b.previousAnchors.join(", ")}. Keep them unless one is listed as stalled; then use a close variation. Rotate everything else.`
        : "No main lifts yet for this session. Choose them from the shape and keep them from now on.",
    b.swapIn.length ? `Skipped twice in a row, so use the swap instead: ${b.swapIn.map((x) => `${x.name} becomes ${x.swap}`).join("; ")}.` : "",
    b.stalled.length ? `Stalled (no progress in three logged sessions): ${b.stalled.join(", ")}. If one is a main lift and this is week 1, swap it for a close variation; otherwise keep going.` : "",
    b.readiness.length ? `Her last log said: ${b.readiness.join("; ")}.` : "",
    b.pain.length ? `Pain she mentioned recently: ${b.pain.join("; ")}.` : "",
    b.likes.length ? `She said she liked: ${b.likes.join(", ")}.` : "",
    b.dislikes.length ? `She said she did not like: ${b.dislikes.join(", ")}. Avoid these.` : "",
    b.requests.length ? `She asked for: ${b.requests.join("; ")}.` : "",
  ];

  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n").trim();
}

function sessionSummary(s: Session): string {
  const when = dateAndTime(s.at);
  if (!s.plan) {
    const text = s.legacyText.split("HOW TO DO THESE")[0].trim().slice(0, 700);
    return `${when}\n${text}`;
  }
  const exercises = exercisesOf(s.plan)
    .filter((e) => e.kind !== "mobility")
    .map((e) => {
      const load = e.loadKg > 0 ? ` @ ${kg(e.loadKg)}` : "";
      const sets = e.sets > 0 ? `${e.sets}x` : "";
      return `${e.label} ${e.name} ${sets}${e.reps}${load}`;
    })
    .join("; ");
  return `${when}: ${s.plan.title}. ${exercises}`;
}

export function buildPrompt(input: PromptInput): Prompt {
  const sessions = [...input.sessions].sort((a, b) => a.at.getTime() - b.at.getTime());
  const recent = sessions.slice(-HISTORY_WINDOW);

  const notes = sessions
    .slice(-NOTES_WINDOW)
    .flatMap((s) => s.notes.map((n) => `${dateOnly(s.at)}: ${n.trim()}`))
    .filter((n) => n.length > 0);

  const targets = input.brief.targets.map(targetLine).join("\n");

  const user = `ABOUT HER
${about(input.preferences)}

TODAY
${dateAndTime(input.slot.startsAt)}, ${input.slot.minutes} minutes.

THE BRIEF
${briefText(input.brief)}

TARGETS
${targets || "None yet. Every load today is a first calibration."}

RECENT SESSIONS, oldest first
${recent.length ? recent.map(sessionSummary).join("\n") : "None yet."}

WHAT SHE WROTE ABOUT RECENT SESSIONS, verbatim
${notes.length ? notes.join("\n") : "Nothing."}${
    input.drawn?.length
      ? `

EXERCISES THAT COME WITH A DRAWING
She can open a drawing of these in the email. When two choices are otherwise equal, choose one of these, and name it exactly as written here. The main lifts already chosen this block stay as they are.
${input.drawn.join(", ")}`
      : ""
  }`;

  return { system: SYSTEM, user };
}
