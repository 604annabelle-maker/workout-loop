/**
 * Reading and writing the one row of preferences.
 *
 * The shape returned is the one `buildPrompt` takes, so there is no translation
 * layer between what is stored and what the model is told.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Preferences } from "./prompt";

const { preferences } = schema;

/** What a brand new install looks like, before anything is filled in. */
export const EMPTY: Preferences = {
  goals: "",
  experience: "",
  trainingDaysPerWeek: 3,
  avoid: "",
  equipment: "",
  brief: "",
};

export async function readPreferences(): Promise<Preferences> {
  const [row] = await db
    .select()
    .from(preferences)
    .where(eq(preferences.id, 1));

  if (!row) return EMPTY;

  return {
    goals: row.goals,
    experience: row.experience,
    trainingDaysPerWeek: row.trainingDaysPerWeek,
    avoid: row.avoid,
    equipment: row.equipment,
    brief: row.brief,
  };
}

export async function savePreferences(next: Preferences): Promise<void> {
  await db
    .insert(preferences)
    .values({ id: 1, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: preferences.id,
      set: { ...next, updatedAt: new Date() },
    });
}
