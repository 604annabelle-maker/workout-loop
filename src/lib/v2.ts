/**
 * The training engine, wired into the plumbing: planning the next session
 * from the log, the email for it, logging from the one Save, and reading
 * replies and comments into the log and memory.
 *
 * Not pure: the database, the mailbox and the model. Retries, idempotency and
 * the booking webhook live in delivery.ts and cron.ts.
 */

import { after } from "next/server";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { composeAmp } from "../email/amp";
import { compose, type Mail } from "../email/cards";
import { composeHtml } from "../email/html";
import { drawings } from "../email/drawings";
import { cardId, draftUpdate, hasDraft, indexOf, postedCards, readDraft, restoreState, stepsOf, type CardDraft } from "../email/draft";
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

const { workouts, feedback, exerciseLog } = schema;


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
  await logForgotten(input.now).catch((err) => console.error("logging a workout she did not save:", err));
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
  const [all, equipment] = await Promise.all([loadHistory(undefined, input.date), loadEquipment()]);
  const history = all.filter((s) => s.date < input.date);
  const base = appUrl();
  const mail: Mail = compose({
    plan,
    date: input.date,
    summary: weekSummary({ history, today: plan, weekStart: weekStart(input.date), targets: targets(growth(history)) }),
    logUrl: base ? `${base}/api/log?t=${encodeURIComponent(input.token)}` : null,
    base,
    pictures: drawings,
    preview: input.preview,
    equipment,
  });
  const amp = composeAmp(mail);
  return { subject: mail.subject, text: composeText(mail), html: composeHtml(mail), ...(amp ? { amp } : {}), inline: [] };
}

// ---------------------------------------------------------------- logging

export interface LogAnswer {
  status: number;
  body: Record<string, unknown>;
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
  try {
    after(async () => {
      await readFeedbackV2(row.id).catch((err) => console.error(`reading comment ${row.id}:`, err));
    });
  } catch {
    // Outside a request (a script): the cron reads it.
  }
}

// ---------------------------------------------------------------- the draft

async function loadDraft(workoutId: string): Promise<unknown> {
  const [row] = await db.select({ draft: workouts.draft }).from(workouts).where(eq(workouts.id, workoutId));
  return row?.draft ?? null;
}

/** Merge keys into the stored draft in one statement, so two posts at once cannot drop each other's keys. */
async function mergeDraft(workoutId: string, keys: Record<string, unknown>): Promise<void> {
  if (!Object.keys(keys).length) return;
  await db
    .update(workouts)
    .set({ draft: sql`coalesce(${workouts.draft}, '{}'::jsonb) || ${JSON.stringify(keys)}::jsonb` })
    .where(eq(workouts.id, workoutId));
}

/** The line under the title: saved, or nothing while she is part way through and has not saved yet. */
export function topLine(logs: LogEntry[], draft: boolean): string {
  if (logs.length) return "Saved \u2713";
  return draft ? "" : "Nothing saved yet";
}

/**
 * The one Save, the draft kept as she goes, picking it back up, and an undo,
 * from the dynamic email.
 *
 * Save logs every card as it shows except the skipped ones (her reply, 19 Nov
 * 2026: she sets the numbers to what she did and only needs skip). Saving
 * again replaces it. Her note is filed once, however many times she saves.
 */
export async function handleLogV2(workoutId: string, plan: PlanV2, form: FormData): Promise<LogAnswer> {
  const kind = String(form.get("kind") ?? "");

  if (kind === "draft") {
    const posted = postedCards((name) => form.get(name), plan);
    const keys = draftUpdate({ stored: await loadDraft(workoutId), posted, touched: String(form.get("card") ?? ""), back: form.get("back") === "1" });
    await mergeDraft(workoutId, keys);
    return { status: 200, body: { saved: "Kept" } };
  }

  if (kind === "note") {
    await mergeDraft(workoutId, { note: String(form.get("note") ?? "").slice(0, 1000) });
    return { status: 200, body: { saved: "Kept" } };
  }

  if (kind === "restore") {
    return { status: 200, body: { ...restoreState(plan, readDraft(await loadDraft(workoutId), plan)), saved: "Back where you left off" } };
  }

  if (kind === "save") {
    const equipment = await loadEquipment();
    const stored = readDraft(await loadDraft(workoutId), plan);
    const cards: Record<string, CardDraft> = {};
    let saved = 0;
    let skipped = 0;
    for (let i = 0; i < plan.exercises.length; i++) {
      const id = cardId(i);
      const slot = String(form.get(`slot_${id}`) ?? plan.exercises[i].slot);
      const planned = plan.exercises.find((x) => x.slot === slot) ?? plan.exercises[i];
      const skip = form.get(`k_${id}`) === "1";
      const usedSwap = form.get(`s_${id}`) === "1" && !!planned.swap;
      const main = entryFrom(planned, false, form.get(`w_${id}`), form.get(`r_${id}`), "done", equipment);
      const alt = planned.swap ? entryFrom(planned, true, form.get(`w_${id}s`), form.get(`r_${id}s`), "done", equipment) : null;
      cards[id] = {
        w: indexOf(main.weight, stepsOf(planned.main)),
        r: main.reps[0],
        k: skip,
        s: usedSwap,
        sw: alt && planned.swap ? indexOf(alt.weight, stepsOf(planned.swap)) : 0,
        sr: alt ? alt.reps[0] : 0,
      };
      if (skip) {
        await deleteLog(workoutId, planned.slot);
        skipped++;
        continue;
      }
      await saveLog(workoutId, usedSwap && alt ? alt : main);
      saved++;
    }
    const note = String(form.get("note") ?? "").trim().slice(0, 1000);
    const fresh = !!note && note !== stored.filed;
    if (fresh) await fileComment(workoutId, note);
    await mergeDraft(workoutId, { ...cards, note, filed: fresh ? note : stored.filed });
    const parts = [
      saved ? `${saved} exercise${saved === 1 ? "" : "s"}` : "",
      skipped ? `${skipped} skipped` : "",
      fresh ? "your note" : "",
    ].filter(Boolean);
    return { status: 200, body: { saved: parts.length ? `Saved ${parts.join(", ")}` : "Saved" } };
  }

  if (kind === "undo") {
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return { status: 400, body: { error: "no such note" } };
    const done = await undoNote(id);
    return { status: 200, body: { saved: done ? "Undone: it won't count from now on" : "Already undone" } };
  }

  return { status: 400, body: { error: "nothing to save" } };
}

/**
 * A workout she tapped in but never saved still counts (her choice, 20 Nov
 * 2026): before the next is planned, any sent workout with a draft and
 * nothing logged is logged as if she had pressed Save, and its note is read.
 * Nothing tapped, nothing logged, as before.
 */
export async function logForgotten(before: Date): Promise<number> {
  const rows = await db
    .select({ id: workouts.id, plan: workouts.planV2, draft: workouts.draft })
    .from(workouts)
    .where(
      and(
        eq(workouts.version, 2),
        eq(workouts.status, "sent"),
        isNotNull(workouts.draft),
        lt(workouts.slotStartsAt, before),
        sql`not exists (select 1 from ${exerciseLog} where ${exerciseLog.workoutId} = ${workouts.id})`,
      ),
    );
  let logged = 0;
  for (const row of rows) {
    const plan = readPlanV2(row.plan);
    if (!plan || !hasDraft(row.draft)) continue;
    const draft = readDraft(row.draft, plan);
    const touched = Object.keys(row.draft as object).some((k) => /^c\d+$/.test(k));
    if (touched) {
      const equipment = await loadEquipment();
      for (const [i, x] of plan.exercises.entries()) {
        const c = draft.cards[cardId(i)];
        if (!c || c.k) continue;
        const swap = c.s && !!x.swap;
        const p = swap ? x.swap! : x.main;
        const w = stepsOf(p)[swap ? c.sw : c.w];
        await saveLog(row.id, entryFrom(x, swap, w === undefined ? null : String(w), String(swap ? c.sr : c.r), "done", equipment));
        logged++;
      }
    }
    const note = draft.note.trim();
    if (note && note !== draft.filed) {
      const [fb] = await db
        .insert(feedback)
        .values({ workoutId: row.id, sourceMessageId: `draft:${row.id}`, body: note })
        .onConflictDoNothing()
        .returning({ id: feedback.id });
      await mergeDraft(row.id, { filed: note });
      if (fb) await readFeedbackV2(fb.id).catch((err) => console.error(`reading note ${fb.id}:`, err));
    }
  }
  return logged;
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
