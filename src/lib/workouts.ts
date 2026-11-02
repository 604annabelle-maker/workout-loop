/**
 * Reading the training log back out (design §History window).
 *
 * One query for the sessions, one for their replies, then everything else is
 * counted in memory by pure code. A few months of one person's training is a
 * few dozen rows.
 */

import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { readPlan, type Plan } from "./plan";
import type { Session, Stamp } from "./progress";
import { readReplyLog, type ReplyLog } from "./reply-log";

const { feedback, workouts } = schema;

/** Long enough for a block and the one before it, plus the weekly review. */
export const LOG_DAYS = 120;

function planOf(raw: unknown): Plan | null {
  if (!raw) return null;
  try {
    return readPlan(raw);
  } catch {
    return null;
  }
}

function stampOf(raw: unknown): Stamp | null {
  if (!raw || typeof raw !== "object") return null;
  const stamp = (raw as { stamp?: unknown }).stamp;
  if (!stamp || typeof stamp !== "object") return null;
  const s = stamp as Partial<Stamp>;
  if (typeof s.typeId !== "string" || typeof s.block !== "number") return null;
  return {
    typeId: s.typeId,
    block: s.block,
    week: typeof s.week === "number" ? s.week : 1,
    blockStartedAt: typeof s.blockStartedAt === "string" ? s.blockStartedAt : new Date(0).toISOString(),
    deload: s.deload === true,
    finisher: typeof s.finisher === "string" ? s.finisher : "",
  };
}

/**
 * Sent sessions from the last `days`, oldest first, each with what was said
 * about it, verbatim and read.
 *
 * Only workouts that were actually sent count. A failed one was never seen,
 * and a generated-but-unsent one is a delivery still in flight; neither says
 * anything about what was trained.
 */
export async function trainingLog(days = LOG_DAYS, now = new Date()): Promise<Session[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: workouts.id,
      slotStartsAt: workouts.slotStartsAt,
      slotMinutes: workouts.slotMinutes,
      planText: workouts.planText,
      plan: workouts.plan,
      brief: workouts.brief,
    })
    .from(workouts)
    .where(and(eq(workouts.status, "sent"), gte(workouts.slotStartsAt, since)))
    .orderBy(desc(workouts.slotStartsAt));

  if (rows.length === 0) return [];

  const notes = await db
    .select({ workoutId: feedback.workoutId, body: feedback.body, log: feedback.log })
    .from(feedback)
    .where(inArray(feedback.workoutId, rows.map((r) => r.id)))
    .orderBy(feedback.receivedAt);

  const byWorkout = new Map<string, { bodies: string[]; logs: ReplyLog[] }>();
  for (const note of notes) {
    if (!note.workoutId) continue;
    const found = byWorkout.get(note.workoutId) ?? { bodies: [], logs: [] };
    found.bodies.push(note.body);
    if (note.log) found.logs.push(readReplyLog(note.log));
    byWorkout.set(note.workoutId, found);
  }

  return rows.reverse().map((row) => {
    const plan = planOf(row.plan);
    const said = byWorkout.get(row.id);
    return {
      at: row.slotStartsAt,
      minutes: row.slotMinutes,
      plan,
      legacyText: plan ? "" : (row.planText ?? ""),
      stamp: stampOf(row.brief),
      notes: said?.bodies ?? [],
      logs: said?.logs ?? [],
    };
  });
}

/** How many sessions have ever been sent. The next one is this plus one. */
export async function sessionsSent(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(workouts)
    .where(eq(workouts.status, "sent"));
  return Number(row?.n ?? 0);
}
