/**
 * The v2 training log, in and out of the database (spec §Data).
 *
 * Not pure: this is the only training module that touches the database. It
 * reads plans, logs, notes and equipment into the shapes the pure modules
 * take, and writes taps and notes back. v1 workouts are never read.
 */

import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReadNote } from "../memory/read";
import { DEFAULT_EQUIPMENT, readEquipment, type Equipment } from "./equipment";
import type { LogEntry, Note, NoteReason, PlanV2, SessionRecord, Tap } from "./types";

const { workouts, exerciseLog, memory, equipment } = schema;

/** Sixteen weeks: long enough for stalls, rotations and growth windows. */
export const HISTORY_DAYS = 112;

export function readPlanV2(raw: unknown): PlanV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PlanV2;
  if (p.version !== 2 || !Array.isArray(p.exercises) || !p.position) return null;
  return p;
}

const TAPS: Tap[] = ["easy", "done", "hard"];

export function readLogRow(row: { slot: string; exerciseId: string; usedSwap: boolean; weight: number | null; reps: unknown; tap: string }): LogEntry | null {
  if (!TAPS.includes(row.tap as Tap)) return null;
  const reps = Array.isArray(row.reps) ? row.reps.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 200) : [];
  return { slot: row.slot, exerciseId: row.exerciseId, usedSwap: row.usedSwap, weight: row.weight, reps, tap: row.tap as Tap };
}

/** Sent v2 sessions, oldest first, each with what she logged. Previews never count. */
export async function loadHistory(days = HISTORY_DAYS, now = new Date()): Promise<SessionRecord[]> {
  const since = new Date(now.getTime() - days * 864e5);
  const rows = await db
    .select({ id: workouts.id, sentAt: workouts.sentAt, planV2: workouts.planV2 })
    .from(workouts)
    .where(and(eq(workouts.version, 2), eq(workouts.status, "sent"), gte(workouts.sentAt, since)))
    .orderBy(workouts.sentAt);
  const ids = rows.map((r) => r.id);
  const logs = ids.length ? await db.select().from(exerciseLog).where(inArray(exerciseLog.workoutId, ids)) : [];
  const out: SessionRecord[] = [];
  for (const r of rows) {
    const plan = readPlanV2(r.planV2);
    if (!plan || !r.sentAt) continue;
    out.push({
      workoutId: r.id,
      date: r.sentAt,
      plan,
      logs: logs.filter((l) => l.workoutId === r.id).map(readLogRow).filter((l): l is LogEntry => !!l),
    });
  }
  return out;
}

const REASONS: NoteReason[] = ["wrong_muscle", "pain", "too_hard", "too_easy", "dislike", "one_off", "liked"];

export async function loadNotes(): Promise<Note[]> {
  const rows = await db.select().from(memory).orderBy(memory.createdAt);
  return rows
    .filter((r) => REASONS.includes(r.reason as NoteReason))
    .map((r) => ({ id: r.id, reason: r.reason as NoteReason, exerciseId: r.exerciseId, text: r.text, createdAt: r.createdAt, undoneAt: r.undoneAt }));
}

export async function addNotes(notes: ReadNote[], workoutId: string | null): Promise<void> {
  if (!notes.length) return;
  await db.insert(memory).values(notes.map((n) => ({ reason: n.reason, exerciseId: n.exerciseId, text: n.text, workoutId })));
}

/** Undo: the note stops counting, everywhere, from now on. */
export async function undoNote(id: string): Promise<boolean> {
  const done = await db
    .update(memory)
    .set({ undoneAt: new Date() })
    .where(and(eq(memory.id, id), isNull(memory.undoneAt)))
    .returning({ id: memory.id });
  return done.length > 0;
}

export async function loadEquipment(): Promise<Equipment> {
  const [row] = await db.select().from(equipment).where(eq(equipment.id, 1));
  return row ? readEquipment(row.data) : DEFAULT_EQUIPMENT;
}

export async function saveEquipment(eq_: Equipment): Promise<void> {
  await db
    .insert(equipment)
    .values({ id: 1, data: eq_ })
    .onConflictDoUpdate({ target: equipment.id, set: { data: eq_, updatedAt: new Date() } });
}

/** One tap: the last tap on a card overwrites the one before. */
export async function saveLog(workoutId: string, entry: LogEntry): Promise<void> {
  const values = {
    workoutId,
    slot: entry.slot,
    exerciseId: entry.exerciseId,
    usedSwap: entry.usedSwap,
    weight: entry.weight,
    reps: entry.reps,
    tap: entry.tap,
    loggedAt: new Date(),
  };
  await db
    .insert(exerciseLog)
    .values(values)
    .onConflictDoUpdate({ target: [exerciseLog.workoutId, exerciseLog.slot], set: values });
}

/** "All done": every slot not tapped yet is logged as written. */
export async function saveUntapped(workoutId: string, entries: LogEntry[]): Promise<number> {
  if (!entries.length) return 0;
  const rows = await db
    .insert(exerciseLog)
    .values(entries.map((e) => ({ workoutId, slot: e.slot, exerciseId: e.exerciseId, usedSwap: e.usedSwap, weight: e.weight, reps: e.reps, tap: e.tap })))
    .onConflictDoNothing()
    .returning({ id: exerciseLog.id });
  return rows.length;
}

export async function logsFor(workoutId: string): Promise<LogEntry[]> {
  const rows = await db.select().from(exerciseLog).where(eq(exerciseLog.workoutId, workoutId));
  return rows.map(readLogRow).filter((l): l is LogEntry => !!l);
}

/** The latest v2 workout sent, for matching replies and the check-in. */
export async function latestV2(): Promise<{ id: string; sentAt: Date | null } | null> {
  const [row] = await db
    .select({ id: workouts.id, sentAt: workouts.sentAt })
    .from(workouts)
    .where(and(eq(workouts.version, 2), eq(workouts.status, "sent")))
    .orderBy(desc(workouts.sentAt))
    .limit(1);
  return row ?? null;
}


