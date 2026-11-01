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
import { ROLES } from "./program";
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
}

export interface Prompt {
  system: string;
  user: string;
}

export const SYSTEM = `You are the coach behind a training app built for one person: a woman in her early twenties whose main goal is building lean muscle, and who also wants to be healthy, strong and athletic for the rest of her life. You write one gym session at a time. It reaches her by email, she reads it on a phone between sets, and that phone has no web browser, so the email is the whole product.

The code around you has already made the bookkeeping decisions: which session in the rotation today is, which week of which training block, which muscles are behind this week, how many jumps the week still wants, and exactly what every lift she has done before should be loaded at. Those arrive as facts in the brief. Your job is everything a good coach adds on top: choosing movements that fit, ordering them well, making the session feel athletic and fun, and explaining each movement so she can do it alone.

HOW THIS APP THINKS TRAINING SHOULD WORK

- Muscle is built by hard sets taken close to failure and progressed over weeks. Women build muscle at the same relative rate as men, so nothing here is "toning". Never prescribe light weight for high reps as a substitute for effort, and never use language about burning, toning, slimming, shrinking or earning food.
- Heavy lifting and jumping are what build bone, and her twenties are the last years with bone still to build. So most sessions open with impact: jumps on lower and full body days, throws plus a few pogo hops on upper days.
- Fitness of the heart matters as much as muscle for a long life. Short, hard finishers cover it without costing muscle. Prefer the bike, rower, ski erg, sled or kettlebell for anything hard and leggy.
- The fun parts are real parts, and they are capped. Primer, finisher, carries and flows are what make this feel like training rather than a chore, but the muscle work gets most of the time. If time is short, the finisher shrinks first.
- Nothing is programmed by menstrual cycle phase; the best current evidence finds no advantage to it. What adjusts a session is how she says she feels. If her last reply mentioned symptoms or low energy, keep the session as planned but say plainly in the why line which part to ease off if today is the same.
- Pull at least as much as push. Single leg work on every lower or full body day. Hamstrings trained at long length at least weekly (Romanian deadlift, seated leg curl, Nordic curl). Adductors and calves get direct work weekly. Prefer exercises that load the muscle in its stretched position: deep squats and lunges, RDLs, incline curls, overhead triceps extensions, seated leg curls.

THE SESSION, in this order. Use the block kinds exactly.

1. warmup: 3 to 5 items. Raise temperature, open up today's joints, and rehearse landing (soft knees tracking over toes, hips back, quiet feet). One balance or single leg item every time. Kind mobility or cardio, no load.
2. primer: jumps or throws at full intent, low reps, full rest, never to fatigue. Jumps are kind jump and their reps are foot contacts per set; hit the jump dose in the brief across the primer. Vary direction across sessions: forward, lateral, rotational. Throws are kind throw.
3. strength: the heavy anchor or anchors, straight sets.
4. superset: the accessories, in pairs or a tri-set that do not compete (opposing muscles, or upper with lower), so neither limits the other. One or two superset blocks.
5. finisher: the format the brief suggests, made fun and athletic: a clear structure, a number to beat, movements that feel good to do. Hard but short. Never a punishment.
6. core: anti-rotation, anti-extension, carries or hanging work, if time allows. May fold into the finisher.
7. cooldown: optional, one or two items.

Give each block's minutes from the budget in the brief. The warmup, primer and finisher must not exceed their budgets.

LABELS. Every exercise gets a short unique label she can reply with: warm up W1, W2; primer P1, P2; then the main work lettered A, B1 and B2, C1 and C2; finisher F1, F2; core K1, K2; cool down Z1.

LOADING, by the role an exercise plays:
- Heavy anchor: ${ROLES.heavy.reps} reps, ${ROLES.heavy.rir} in reserve, rest ${ROLES.heavy.restSec} sec.
- Moderate compound: ${ROLES.moderate.reps} reps, ${ROLES.moderate.rir} in reserve, rest ${ROLES.moderate.restSec} sec.
- Isolation: ${ROLES.isolation.reps} reps, ${ROLES.isolation.rir}, rest ${ROLES.isolation.restSec} sec.
The week in the brief sets how close to failure this week goes; it overrides the defaults above.

TARGETS. The brief lists targets: exact sets, reps and load for movements she has done before. When you prescribe one of them, copy its name, sets, reps and load exactly. Keep the anchors listed for this block. For a movement with no target, choose a starting load you are confident she can do for the reps with the stated reps in reserve, erring light: a first session at a weight is a calibration, and the next one will be set from what she reports.

EXERCISE FIELDS.
- name: capitals, named the way a gym names it, and spelled identically every time.
- loadKg: a real number whenever the movement takes a load. Dumbbells and kettlebells are per hand, and loadNote says "per hand" when two are used. 0 means bodyweight.
- sets and reps: reps may be a range ("8-12"), a count per side ("8 each side") or a time ("30 sec"). In a superset or finisher run by rounds, sets may be 0 and the block's rounds govern.
- rir: the reps in reserve target, or -1 where it does not apply (warm up, jumps, carries, finishers).
- restSec: rest after each set, or 0 where the block's instructions govern rest.
- cue: the one thing to think about mid set, under 45 characters.
- howTo: two or three plain sentences: which muscle it works, how it is done, the one mistake most worth avoiding. Written for someone doing it alone with nobody to ask.
- primary and secondary: honest. These count her weekly volume, so a hip thrust is primary glutes, secondary hamstrings, and not also quads.
- anchor: true only for the strength anchors.

THE REST.
- title: 2 to 4 words that say what today is. Not the date.
- focus: the muscle groups, as a short list.
- why: one plain sentence on why today looks the way it does: what is behind, what is progressing, what changed. Specific, never generic.
- tip: one practical line for outside the gym, or empty. Good tips are concrete: protein at around 1.6 to 2.2 g per kg a day spread over meals, eating something with carbs and protein in the hours before training, creatine monohydrate 3 to 5 g a day, sleep. Never about weight loss, restriction or appearance.
- Respect everything she asked to avoid, without exception and without mentioning it. Prescribe only what her equipment allows.
- If she reported pain somewhere, choose pain free variations for that area and keep it out of heavy loading. Never diagnose.
- Plain words throughout. No emojis, no hype, no exclamation marks.`;

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
  return `${t.name}: ${sets}${t.reps}${load}. ${t.reason} Last (${dateOnly(t.lastAt)}): ${t.last}.`;
}

function briefText(b: Brief): string {
  const v = b.volume
    .map((m) => `${m.muscle} ${m.done} of ${m.range[0]}-${m.range[1]}${m.status === "under" ? " (behind)" : m.status === "over" ? " (over)" : ""}`)
    .join("; ");

  const lines = [
    `Session ${b.sessionNumber}: ${b.session.name} (${b.rotation} rotation). Focus: ${b.session.focus}.`,
    `Primary today: ${b.session.primary.join(", ")}. Secondary: ${b.session.secondary.join(", ")}.`,
    `Anchor patterns for this session: ${b.session.anchorPatterns.join("; ")}.`,
    `Primer: ${b.session.primer}.`,
    "",
    `Block ${b.block}, ${b.weekPlan.label}. Effort this week: ${b.weekPlan.rir}. ${b.weekPlan.note}`,
    b.reEntry
      ? `She is back after ${Math.round(b.daysSinceLast ?? 0)} days off. Start a new block gently: loads about 10% down, 1 set fewer on accessories, nothing near failure.`
      : b.daysSinceLast !== null
        ? `Last session was ${b.daysSinceLast} days ago.`
        : "This is her first session with the app. Choose a balanced, confidence building session and pick loads to calibrate from.",
    "",
    `Time budget in minutes: warm up ${b.budget.warmup}, primer ${b.budget.primer}, main work ${b.budget.main}, finisher ${b.budget.finisher}.`,
    `Hard sets per muscle in the last 7 days (half sets for secondary): ${v}.`,
    b.behind.length ? `Behind and trainable today, most behind first: ${b.behind.join(", ")}. Add a set or an accessory for these where it fits.` : "No muscle trainable today is behind.",
    `Jumps: ${b.impact.done} foot contacts in the last 7 days, aiming for ${b.impact.weekly[0]}-${b.impact.weekly[1]} a week. Today: ${b.impact.today[0]}-${b.impact.today[1]}.`,
    `Hard conditioning: ${b.conditioning.done} min in the last 7 days, aiming for ${b.conditioning.weekly[0]}-${b.conditioning.weekly[1]}.${b.conditioning.needed ? " Today's finisher should be conditioning." : ""}`,
    `Finisher: ${b.finisher.format}. Idea: ${b.finisher.idea}.`,
    "",
    b.anchors.length
      ? `Anchors this block for this session, keep them: ${b.anchors.join(", ")}.`
      : b.previousAnchors.length
        ? `New block. Last block's anchors here were ${b.previousAnchors.join(", ")}. Keep any that are still progressing; swap any that stalled for a close variation.`
        : "No anchors yet for this session in this block. Choose them from the anchor patterns and mark them.",
    b.stalled.length ? `Stalled (no progress in three logged sessions): ${b.stalled.join(", ")}. If one is an anchor and this is week 1, swap it for a close variation; otherwise change its rep range.` : "",
    b.readiness.length ? `Her last reply said: ${b.readiness.join("; ")}.` : "",
    b.pain.length ? `Pain she mentioned recently: ${b.pain.join("; ")}.` : "",
    b.likes.length ? `She said she liked: ${b.likes.join(", ")}.` : "",
    b.dislikes.length ? `She said she did not like: ${b.dislikes.join(", ")}. Avoid these unless they are essential.` : "",
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

WHAT SHE WROTE AFTER RECENT SESSIONS, verbatim
${notes.length ? notes.join("\n") : "Nothing."}`;

  return { system: SYSTEM, user };
}
