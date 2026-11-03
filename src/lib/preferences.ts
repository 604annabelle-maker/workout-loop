/**
 * Reading and writing the one row of preferences.
 *
 * The shape returned is ./profile.ts's, which is what the coach and the
 * prompt take, so there is no translation layer between what is stored and
 * what drives the session.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { EMPTY, readJumpDays, readLevel, readPriorities, type Preferences } from "./profile";

const { preferences } = schema;

export { EMPTY };

export async function readPreferences(): Promise<Preferences> {
  const [row] = await db
    .select()
    .from(preferences)
    .where(eq(preferences.id, 1));

  if (!row) return EMPTY;

  return {
    goals: row.goals,
    experience: row.experience,
    level: readLevel(row.level),
    trainingDaysPerWeek: row.trainingDaysPerWeek,
    priorities: readPriorities(row.priorities),
    avoid: row.avoid,
    equipment: row.equipment,
    enjoys: row.enjoys,
    cycleTracking: row.cycleTracking,
    jumpDays: readJumpDays(row.jumpDays),
    brief: row.brief,
  };
}

export async function savePreferences(next: Preferences): Promise<void> {
  const row = {
    ...next,
    priorities: next.priorities.join(", "),
    updatedAt: new Date(),
  };

  await db
    .insert(preferences)
    .values({ id: 1, ...row })
    .onConflictDoUpdate({ target: preferences.id, set: row });
}
