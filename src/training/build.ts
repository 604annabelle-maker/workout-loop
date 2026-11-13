/**
 * One session, from history to a checked plan (spec §How a session is planned).
 *
 * Pure apart from the picker it is handed, which is the model in production
 * (choose.ts) and a stub in tests. Code builds the skeleton, decides which
 * slots may change, filters the candidates, sets every number and builds the
 * warm-up. The picker only chooses among candidates for open slots, and
 * whatever it answers, the plan returned passes checkPlan: bad picks are sent
 * back with the reasons, twice, then code fills those slots itself.
 */

import { fresh, swapLine, tooHard, weightLine } from "../memory/apply";
import { capRotations, candidates, decide, fits, fitsSwap, slotHistory, swapFor, type Decision } from "./candidates";
import { catalogue, exercise, isBodyweight, type Exercise } from "./catalogue";
import { checkPlan, volumeOf } from "./check";
import { deloadNow, growth } from "./deload";
import { stepDown, type Equipment } from "./equipment";
import { effortLine, next, type Next } from "./progress";
import { CLASS, ROTATION, SESSION_MUSCLE_CAP, type Muscle } from "./rules";
import { nextPosition, skeleton, targets, workMinutes, type Position, type Skeleton, type Slot } from "./skeleton";
import type { ChangeLine, Note, PlannedExercise, PlanV2, Prescription, SessionRecord } from "./types";
import { warmup, warmupMinutes } from "./warmup";

export interface PickRequest {
  sessionName: string;
  slots: {
    key: string;
    muscle: string;
    class: string;
    sets: number;
    reps: [number, number];
    preferStretched: boolean;
    candidates: { id: string; name: string; primary: string[]; secondary: string[]; stretched: boolean; equipment: string }[];
  }[];
  /** Exercises already fixed in this session, for context. */
  fixed: { slot: string; name: string }[];
  /** What she has said, as notes. */
  notes: string[];
  /** Why the last answer was refused, when retrying. */
  failures: string[];
}

export interface PickAnswer {
  picks: { slot: string; exerciseId: string; why?: string }[];
}

export type Picker = (req: PickRequest) => Promise<PickAnswer | null>;

export interface BuildInput {
  history: SessionRecord[];
  notes: Note[];
  equipment: Equipment;
  now: Date;
  pick?: Picker;
  /** For a preview: plan this position instead of the next one. */
  position?: Position;
  /** A set budget multiplier from the monthly check-in ("too long" is below 1). */
  budget?: number;
}

export interface Built {
  plan: PlanV2;
  skeleton: Skeleton;
  /** True when the model's picks were used for every open slot. */
  modelUsed: boolean;
  failures: string[];
}

const latest = (history: SessionRecord[]) =>
  [...history].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;

function prescribe(e: Exercise, slot: Slot, input: BuildInput): Next {
  return next({ exerciseId: e.id, load: e.load, range: slot.reps, history: input.history, equipment: input.equipment, notes: input.notes, now: input.now });
}

export async function buildSession(input: BuildInput): Promise<Built> {
  const { history, notes, equipment, now } = input;
  const last = latest(history);
  const position = input.position ?? nextPosition(last?.plan.position ?? null);
  const since = last?.date ?? null;
  const { deload } = deloadNow({ history, notes, cycle: position.cycle, since });
  const t = targets(growth(history));
  let sk = skeleton(position, { targets: t, deload });
  if (input.budget && input.budget < 1 && !deload) {
    // "Too long" from the check-in: drop a set from the biggest slots, keeping every slot at two or more.
    let cut = Math.round(sk.slots.reduce((s, x) => s + x.setCount, 0) * (1 - input.budget));
    const slots = sk.slots.map((x) => ({ ...x }));
    while (cut-- > 0) {
      const biggest = slots.filter((x) => !x.finisher && x.setCount > 2).sort((a, b) => b.setCount - a.setCount)[0];
      if (!biggest) break;
      biggest.setCount--;
    }
    sk = { ...sk, slots };
  }

  // Which slots keep their exercise, and which may change.
  const histories = sk.slots.map((slot) => slotHistory(slot.key, history));
  const decisions: Decision[] = capRotations(
    sk.slots.map((slot, i) => {
      const h = histories[i];
      const cur = h.current ? exercise(h.current) : undefined;
      const flags = cur ? prescribe(cur, slot, input) : undefined;
      return decide(slot, h, { notes, now, equipment, swapExercise: flags?.swapExercise, readyForHarder: flags?.readyForHarder });
    }),
    histories,
  );

  const locked = new Map<string, string>();
  decisions.forEach((d, i) => {
    if (d.mode === "locked") locked.set(sk.slots[i].key, d.exerciseId);
  });

  const lists = new Map<string, Exercise[]>();
  for (const [i, slot] of sk.slots.entries()) {
    if (decisions[i].mode !== "open") continue;
    const d = decisions[i];
    const exclude = d.previous ? [d.previous] : [];
    lists.set(slot.key, candidates(slot, { notes, now, equipment, history, taken: [...locked.values()], exclude }));
  }

  const open = sk.slots.filter((_, i) => decisions[i].mode === "open");
  const bodyweightLocked = [...locked.values()].filter((id) => {
    const e = exercise(id);
    return e && isBodyweight(e) && !sk.slots.find((s) => locked.get(s.key) === id)?.finisher;
  }).length;

  /** Fill open slots from picks where valid, from the ranked lists where not. */
  const fill = (picks: Map<string, { id: string; why?: string }>) => {
    const chosen = new Map(locked);
    const why = new Map<string, string>();
    let bodyweight = bodyweightLocked;
    const bad: string[] = [];
    const setsOf = (key: string) => sk.slots.find((s) => s.key === key)!.setCount;
    const volume = () => volumeOf([...chosen.entries()].map(([key, id]) => ({ exerciseId: id, sets: setsOf(key) })));
    // An exercise whose real muscles would push one past the session cap, counting what the
    // slots still to fill will add, is skipped, whoever picked it.
    let pending = [...open];
    const underCap = (e: Exercise, sets: number) => {
      const v = volume();
      for (const rest of pending.slice(1))
        for (const [m, n] of Object.entries(rest.expect) as [Muscle, number][]) v[m] = (v[m] ?? 0) + n * rest.setCount;
      const add = volumeOf([{ exerciseId: e.id, sets }]);
      return (Object.entries(add) as [Muscle, number][]).every(([m, n]) => (v[m] ?? 0) + n <= SESSION_MUSCLE_CAP + 1e-9);
    };
    for (const slot of open) {
      pending = pending.slice(pending.indexOf(slot));
      const list = (lists.get(slot.key) ?? []).filter((e) => ![...chosen.values()].includes(e.id));
      const okBody = (e: Exercise) =>
        (slot.finisher || !isBodyweight(e) || bodyweight < ROTATION.maxBodyweightPerSession) && underCap(e, slot.setCount);
      const p = picks.get(slot.key);
      let e = p ? list.find((x) => x.id === p.id && okBody(x)) : undefined;
      if (p && !e) bad.push(`${p.id} is not one of the candidates for ${slot.key}${exercise(p.id) && !fits(exercise(p.id)!, slot) ? ` (it does not train ${slot.muscle})` : ""}`);
      if (!e) e = list.find(okBody) ?? list[0];
      if (!e) throw new Error(`no candidate fits ${slot.key} (${slot.muscle}, ${slot.class})`);
      if (isBodyweight(e) && !slot.finisher) bodyweight++;
      chosen.set(slot.key, e.id);
      if (p?.why && e.id === p.id) why.set(slot.key, p.why);
    }
    return { chosen, why, bad };
  };

  const assemble = (chosen: Map<string, string>, why: Map<string, string>): PlanV2 => {
    const fresh_ = fresh(notes, since);
    const changes: ChangeLine[] = [];
    const exercises: PlannedExercise[] = sk.slots.map((slot, i) => {
      const id = chosen.get(slot.key)!;
      const e = exercise(id)!;
      const d = decisions[i];
      const main = prescribe(e, slot, input);
      let mainP: Prescription = strip(main);
      // Too hard and no easier variation: a step lighter.
      const hard = tooHard(notes, e.id, since);
      if (hard && d.mode === "locked" && id === histories[i].current && mainP.weight !== null) {
        const w = stepDown(mainP.weight, main.steps) ?? mainP.weight;
        mainP = { ...mainP, weight: w };
        changes.push({ noteId: hard.id, text: weightLine(e.name, false, hard) });
      }
      const tooEasy = fresh_.find((n) => n.reason === "too_easy" && n.exerciseId === e.id);
      if (tooEasy) changes.push({ noteId: tooEasy.id, text: weightLine(e.name, true, tooEasy) });

      const pool = catalogue().filter((x) => fitsSwap(x, slot) && x.id !== e.id && ![...chosen.values()].includes(x.id));
      const ranked = [
        ...candidates(slot, { notes, now, equipment, history, taken: [...chosen.values()] }),
        ...(slot.class === "heavy" ? candidates({ ...slot, class: "compound" }, { notes, now, equipment, history, taken: [...chosen.values()] }) : []),
      ];
      const swapEx = swapFor(e, slot, ranked.length ? ranked : pool, notes, now);
      const swap = swapEx ? strip(prescribe(swapEx, slot, input)) : null;

      const change = d.mode === "open" ? (d.change && histories[i].current ? d.change : undefined) : d.change;
      const previous = change ? (d.previous ?? histories[i].current ?? undefined) : undefined;
      if (change?.kind === "note" && previous && previous !== e.id) {
        const n = notes.find((x) => x.id === (change as { noteId: string }).noteId);
        const prev = exercise(previous);
        if (n && prev) changes.push({ noteId: n.id, text: swapLine(prev.name, e.name, n) });
      }
      const cls = CLASS[slot.class];
      return {
        slot: slot.key,
        muscle: slot.muscle,
        class: slot.class,
        sets: slot.setCount,
        rest: cls.rest,
        effort: effortLine(slot.class, sk.deload),
        main: mainP,
        swap,
        ...(why.get(slot.key) ? { why: why.get(slot.key) } : {}),
        ...(change ? { change } : {}),
        ...(change && previous ? { previous } : {}),
        ...(slot.finisher ? { finisher: true } : {}),
      };
    });
    const wu = warmup(exercises, equipment);
    return {
      version: 2,
      position,
      deload: sk.deload,
      exercises,
      warmup: wu,
      changes: dedupe(changes),
      minutes: workMinutes(sk.slots) + warmupMinutes(wu),
    };
  };

  const check = (plan: PlanV2) =>
    checkPlan({ plan, skeleton: sk, notes, equipment, history: history.filter((s) => s.plan.position.cycle === position.cycle), targets: t });

  let failures: string[] = [];
  let modelUsed = false;
  if (input.pick && open.length) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = await input.pick(request(sk, open, lists, locked, notes, failures)).catch(() => null);
      if (!answer) break;
      const picks = new Map(answer.picks.map((p) => [p.slot, { id: p.exerciseId, why: p.why }]));
      const { chosen, why, bad } = fill(picks);
      const plan = assemble(chosen, why);
      failures = [...bad, ...check(plan)];
      if (!failures.length) return { plan, skeleton: sk, modelUsed: (modelUsed = true), failures: [] };
    }
  }
  const { chosen } = fill(new Map());
  const plan = assemble(chosen, new Map());
  const final = check(plan);
  if (final.length) throw new PlanRefused(final);
  return { plan, skeleton: sk, modelUsed, failures };
}

/** A plan code itself could not make pass the checks. It is never emailed. */
export class PlanRefused extends Error {
  constructor(public failures: string[]) {
    super(`plan refused: ${failures.join("; ")}`);
  }
}

const strip = (n: Next): Prescription => ({
  exerciseId: n.exerciseId,
  load: n.load,
  weight: n.weight,
  steps: n.steps,
  reps: n.reps,
  range: n.range,
  findIt: n.findIt,
});

const dedupe = (lines: ChangeLine[]) => lines.filter((l, i) => lines.findIndex((x) => x.text === l.text) === i);

function request(
  sk: Skeleton,
  open: Slot[],
  lists: Map<string, Exercise[]>,
  locked: Map<string, string>,
  notes: Note[],
  failures: string[],
): PickRequest {
  return {
    sessionName: sk.type,
    slots: open.map((slot) => ({
      key: slot.key,
      muscle: slot.muscle,
      class: slot.class,
      sets: slot.setCount,
      reps: slot.reps,
      preferStretched: !!slot.preferStretched,
      candidates: (lists.get(slot.key) ?? []).slice(0, 12).map((e) => ({
        id: e.id,
        name: e.name,
        primary: e.primary,
        secondary: e.secondary,
        stretched: e.stretched,
        equipment: e.load,
      })),
    })),
    fixed: [...locked.entries()].map(([slot, id]) => ({ slot, name: exercise(id)?.name ?? id })),
    notes: notes.filter((n) => !n.undoneAt).map((n) => `${n.reason}${n.exerciseId ? ` (${exercise(n.exerciseId)?.name ?? n.exerciseId})` : ""}: ${n.text}`),
    failures,
  };
}


