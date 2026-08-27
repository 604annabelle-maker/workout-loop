/**
 * Reading workouts back out (design §History window).
 */

import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { HISTORY_WINDOW, type PastWorkout } from "./prompt";

const { feedback, workouts } = schema;

/**
 * The recent sessions, oldest first, each with any replies filed against it.
 *
 * Only workouts that were actually sent count as history. A failed one was
 * never seen, and a generated-but-unsent one is a delivery still in flight;
 * neither says anything about what was trained.
 */
export async function recentWorkouts(
  limit = HISTORY_WINDOW,
): Promise<PastWorkout[]> {
  const rows = await db
    .select({
      id: workouts.id,
      slotStartsAt: workouts.slotStartsAt,
      planText: workouts.planText,
    })
    .from(workouts)
    .where(eq(workouts.status, "sent"))
    .orderBy(desc(workouts.slotStartsAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const notes = await db
    .select({ workoutId: feedback.workoutId, body: feedback.body })
    .from(feedback)
    .where(
      inArray(
        feedback.workoutId,
        rows.map((r) => r.id),
      ),
    );

  const byWorkout = new Map<string, string[]>();
  for (const note of notes) {
    if (!note.workoutId) continue;
    const found = byWorkout.get(note.workoutId) ?? [];
    found.push(note.body);
    byWorkout.set(note.workoutId, found);
  }

  // Newest first out of the query, oldest first into the prompt.
  return rows.reverse().map((row) => ({
    slotStartsAt: row.slotStartsAt,
    planText: row.planText ?? "",
    feedback: byWorkout.get(row.id) ?? [],
  }));
}
