/**
 * The training engine, wired into the plumbing: planning the next session
 * from the log, the email for it, logging from the one Save, and reading
 * replies and comments into the log and memory.
 *
 * Not pure: the database, the mailbox and the model. Retries, idempotency and
 * the booking webhook live in delivery.ts and cron.ts.
 */

import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { composeAmp } from "../email/amp";
import { compose, type Mail } from "../email/cards";
import { composeHtml } from "../email/html";
import { drawings } from "../email/drawings";
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
  deleteLog,
  logsFor,
  readPlanV2,
  saveLog,
  saveUntapped,
  undoNote,
} from "../training/history";
import { LOWER, nextPosition, targets, UPPER, type Position, type SessionType } from "../training/skeleton";
import { weekSummary } from "../training/summary";
import type { LogEntry, PlanV2, Tap } from "../training/types";
import { budgetFromCheckins } from "./checkin";
import { appUrl } from "./app-url";
import { weekStart } from "./when";

const { workouts, feedback } = schema;


/** "upper" means the next upper day in order, and so on; anything else, the next session. */
export function positionFor(last: Position | null, focus: string | null): Position | undefined {
  const want: Record<string, SessionType[]> = { upper: UPPER, lower: LOWER, full: ["full"] };
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
    pictures: drawings,
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

/** One exercise as she left it on its card: the weight snapped to one that exists, reps on every set. */
function entryFrom(
  planned: PlanV2["exercises"][number],
  usedSwap: boolean,
  rawW: FormDataEntryValue | null,
  rawR: FormDataEntryValue | null,
  tap: Tap,
  equipment: Awaited<ReturnType<typeof loadEquipment>>,
): LogEntry {
  const p = usedSwap ? planned.swap! : planned.main;
  const reps = Math.round(Number(rawR));
  let weight: number | null = null;
  if (isWeighted(p.load)) {
    const w = Number(rawW);
    weight = Number.isFinite(w) && w > 0 ? (nearest(w, loadable(p.load, equipment)) ?? p.weight) : p.weight;
  }
  return {
    slot: planned.slot,
    exerciseId: p.exerciseId,
    usedSwap,
    weight,
    reps: Array(planned.sets).fill(Number.isFinite(reps) && reps > 0 && reps <= 50 ? reps : p.reps),
    tap,
  };
}

/** Her note, filed like a reply and read after the answer: the model can take a few seconds, and the cron reads anything this misses. */
async function fileComment(workoutId: string, note: string): Promise<void> {
  const [row] = await db
    .insert(feedback)
    .values({ workoutId, sourceMessageId: `amp:${workoutId}:${Date.now()}`, body: note })
    .returning({ id: feedback.id });
  after(async () => {
    await readFeedbackV2(row.id).catch((err) => console.error(`reading comment ${row.id}:`, err));
  });
}

/** The one Save, or an undo, from the dynamic email. */
export async function handleLogV2(workoutId: string, plan: PlanV2, form: FormData): Promise<LogAnswer> {
  const kind = String(form.get("kind") ?? "");
  const equipment = await loadEquipment();

  if (kind === "save") {
    // One Save for the whole workout. Only cards with a pick count; skip removes one; an untouched card is left as it was.
    let saved = 0;
    let skipped = 0;
    for (let i = 1; i <= plan.exercises.length; i++) {
      const id = `c${i}`;
      const slot = String(form.get(`slot_${id}`) ?? plan.exercises[i - 1].slot);
      const planned = plan.exercises.find((x) => x.slot === slot);
      const pick = String(form.get(`t_${id}`) ?? "");
      if (!planned || !pick) continue;
      if (pick === "skip") {
        await deleteLog(workoutId, slot);
        skipped++;
        continue;
      }
      const tap = readTap(pick);
      if (!tap) continue;
      const usedSwap = form.get(`s_${id}`) === "1" && !!planned.swap;
      const sid = usedSwap ? `${id}s` : id;
      await saveLog(workoutId, entryFrom(planned, usedSwap, form.get(`w_${sid}`), form.get(`r_${sid}`), tap, equipment));
      saved++;
    }
    const note = String(form.get("note") ?? "").trim().slice(0, 1000);
    if (note) await fileComment(workoutId, note);
    if (!saved && !skipped && !note) return { status: 400, body: { error: "Pick easy, done, hard or skip first" } };
    const parts = [
      saved ? `${saved} exercise${saved === 1 ? "" : "s"}` : "",
      skipped ? `${skipped} skipped` : "",
      note ? "your note" : "",
    ].filter(Boolean);
    return { status: 200, body: { saved: `Saved ${parts.join(", ")}` } };
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
