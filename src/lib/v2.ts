/**
 * The rebuild, wired into the kept plumbing (plan stage 12).
 *
 * Not pure: the database, the mailbox and the model. Behind PLAN_VERSION=2 a
 * booking goes through the v2 engine: history, then a checked plan, then the
 * new email. Retries, idempotency and the booking webhook are unchanged; a
 * workout that already has a v1 plan finishes as v1.
 */

import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { composeAmp } from "../email/amp";
import { compose, type Mail } from "../email/cards";
import { composeHtml } from "../email/html";
import { photos } from "../email/photos";
import { asLogged, readShorthand } from "../email/reply";
import { composeText } from "../email/text";
import { readComment } from "../memory/read";
import { buildSession, type Built } from "../training/build";
import { picker } from "../training/choose";
import { exercise } from "../training/catalogue";
import { growth } from "../training/deload";
import { isWeighted, kg, loadable, nearest } from "../training/equipment";
import {
  addNotes,
  loadEquipment,
  loadHistory,
  loadNotes,
  logsFor,
  readPlanV2,
  saveLog,
  saveUntapped,
  undoNote,
} from "../training/history";
import { nextPosition, targets, type Position, type SessionType } from "../training/skeleton";
import { weekSummary } from "../training/summary";
import type { LogEntry, PlanV2, Tap } from "../training/types";
import { budgetFromCheckins } from "./checkin";
import { appUrl } from "./reminders";
import { weekStart } from "./when";

const { workouts, feedback } = schema;

export const v2On = () => process.env.PLAN_VERSION?.trim() === "2";

/** "upper" means the next upper day in order, and so on; anything else, the next session. */
export function positionFor(last: Position | null, focus: string | null): Position | undefined {
  const want: Record<string, SessionType[]> = { upper: ["upper_a", "upper_b"], lower: ["lower_a", "lower_b"], full: ["full"] };
  if (!focus || !want[focus]) return undefined;
  let pos = nextPosition(last);
  for (let i = 0; i < 8; i++) {
    if (want[focus].includes(pos.type)) return pos;
    pos = nextPosition(pos);
  }
  if (focus === "full") return { ...nextPosition(last), type: "full" };
  return undefined;
}

/** Plan the next session from everything logged so far. */
export async function planNext(input: { now: Date; focus?: string | null }): Promise<Built> {
  const [history, notes, equipment] = await Promise.all([loadHistory(undefined, input.now), loadNotes(), loadEquipment()]);
  const past = history.filter((s) => s.date < input.now);
  const last = past[past.length - 1]?.plan.position ?? null;
  return buildSession({
    history: past,
    notes,
    equipment,
    now: input.now,
    pick: picker(),
    position: positionFor(last, input.focus ?? null),
    budget: await budgetFromCheckins(),
  });
}

/** All three versions of a v2 workout email. */
export async function mailFor(plan: PlanV2, input: { date: Date; token: string; preview?: boolean }) {
  const history = (await loadHistory(undefined, input.date)).filter((s) => s.date < input.date);
  const base = appUrl();
  const mail: Mail = compose({
    plan,
    date: input.date,
    summary: weekSummary({ history, today: plan, weekStart: weekStart(input.date), targets: targets(growth(history)) }),
    logUrl: base ? `${base}/api/log?t=${encodeURIComponent(input.token)}` : null,
    base,
    photos,
    familiar: new Set(history.flatMap((s) => s.logs.map((l) => l.exerciseId))),
    preview: input.preview,
  });
  const amp = composeAmp(mail);
  return { subject: mail.subject, text: composeText(mail), html: composeHtml(mail), ...(amp ? { amp } : {}), inline: [] };
}

// ---------------------------------------------------------------- logging

export interface LogAnswer {
  status: number;
  body: Record<string, string>;
}

function readTap(raw: FormDataEntryValue | null): Tap | null {
  const t = String(raw ?? "");
  return t === "easy" || t === "done" || t === "hard" ? t : null;
}

/** "3 of 7 logged" */
export function loggedLine(plan: PlanV2, logs: LogEntry[]): string {
  const n = new Set(logs.map((l) => l.slot)).size;
  if (n === 0) return "Nothing logged yet";
  return n >= plan.exercises.length ? "All logged" : `${n} of ${plan.exercises.length} logged`;
}

/** One tap, the comment, all done or an undo, from the dynamic email. */
export async function handleLogV2(workoutId: string, plan: PlanV2, form: FormData): Promise<LogAnswer> {
  const kind = String(form.get("kind") ?? "");
  const equipment = await loadEquipment();

  if (kind === "tap") {
    const slot = String(form.get("slot") ?? "");
    const planned = plan.exercises.find((x) => x.slot === slot);
    const tap = readTap(form.get("tap"));
    if (!planned || !tap) return { status: 400, body: { error: "nothing to save" } };
    const usedSwap = form.get("swap") === "1" && !!planned.swap;
    const p = usedSwap ? planned.swap! : planned.main;
    const reps = Math.round(Number(form.get("r")));
    let weight: number | null = null;
    if (isWeighted(p.load)) {
      const w = Number(form.get("w"));
      weight = Number.isFinite(w) && w > 0 ? (nearest(w, loadable(p.load, equipment)) ?? p.weight) : p.weight;
    }
    const entry: LogEntry = {
      slot,
      exerciseId: p.exerciseId,
      usedSwap,
      weight,
      reps: Array(planned.sets).fill(Number.isFinite(reps) && reps > 0 && reps <= 50 ? reps : p.reps),
      tap,
    };
    await saveLog(workoutId, entry);
    const name = exercise(p.exerciseId)?.name ?? p.exerciseId;
    return { status: 200, body: { saved: `Saved: ${name}, ${weight === null ? "" : `${kg(weight)} kg × `}${entry.reps[0]}, ${tap}` } };
  }

  if (kind === "all") {
    const logged = new Set((await logsFor(workoutId)).map((l) => l.slot));
    const rest = plan.exercises.filter((x) => !logged.has(x.slot)).map((x) => asLogged(plan, x.slot)!);
    const n = await saveUntapped(workoutId, rest);
    return { status: 200, body: { saved: n ? `All done: ${n} more logged as written` : "All done" } };
  }

  if (kind === "comment") {
    const note = String(form.get("note") ?? "").trim().slice(0, 1000);
    if (!note) return { status: 400, body: { error: "nothing to save" } };
    const [row] = await db
      .insert(feedback)
      .values({ workoutId, sourceMessageId: `amp:${workoutId}:${Date.now()}`, body: note })
      .returning({ id: feedback.id });
    // Read after answering: the model can take a few seconds, and the cron reads anything this misses.
    after(async () => {
      await readFeedbackV2(row.id).catch((err) => console.error(`reading comment ${row.id}:`, err));
    });
    return { status: 200, body: { saved: "Saved, thank you" } };
  }

  if (kind === "undo") {
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return { status: 400, body: { error: "no such note" } };
    const done = await undoNote(id);
    return { status: 200, body: { saved: done ? "Undone: it won't count from now on" : "Already undone" } };
  }

  return { status: 400, body: { error: "nothing to save" } };
}

// ---------------------------------------------------------------- replies and comments

/**
 * Read one filed reply or comment to a v2 workout: shorthand into logs, the
 * rest into notes. Marks it read, so the cron does not read it twice.
 */
export async function readFeedbackV2(feedbackId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: feedback.id, body: feedback.body, workoutId: feedback.workoutId, plan: workouts.planV2, attempts: feedback.logAttempts })
    .from(feedback)
    .innerJoin(workouts, eq(feedback.workoutId, workouts.id))
    .where(and(eq(feedback.id, feedbackId), isNull(feedback.log)));
  const plan = row ? readPlanV2(row.plan) : null;
  if (!row || !plan || !row.workoutId) return false;
  try {
    const equipment = await loadEquipment();
    const read = readShorthand(row.body, plan, equipment);
    for (const e of read.entries) await saveLog(row.workoutId, e);
    if (read.allDone) {
      const logged = new Set((await logsFor(row.workoutId)).map((l) => l.slot));
      await saveUntapped(row.workoutId, plan.exercises.filter((x) => !logged.has(x.slot)).map((x) => asLogged(plan, x.slot)!));
    }
    const ids = plan.exercises.flatMap((x) => [x.main.exerciseId, ...(x.swap ? [x.swap.exerciseId] : [])]);
    const notes = await readComment(read.words, ids);
    await addNotes(notes, row.workoutId);
    await db
      .update(feedback)
      .set({ log: { v2: true, logged: read.entries.length, allDone: read.allDone, notes: notes.length }, logAttempts: row.attempts + 1 })
      .where(eq(feedback.id, row.id));
    return true;
  } catch (err) {
    await db.update(feedback).set({ logAttempts: row.attempts + 1 }).where(eq(feedback.id, row.id));
    throw err;
  }
}
