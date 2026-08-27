"use server";

import { revalidatePath } from "next/cache";
import { savePreferences } from "@/lib/preferences";

export async function updatePreferences(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "").trim();

  const days = Number(form.get("trainingDaysPerWeek"));

  await savePreferences({
    goals: text("goals"),
    experience: text("experience"),
    // A nonsense value would otherwise reach the prompt as "NaN days a week".
    trainingDaysPerWeek: Number.isFinite(days) ? Math.min(Math.max(days, 0), 14) : 3,
    avoid: text("avoid"),
    equipment: text("equipment"),
    brief: text("brief"),
  });

  revalidatePath("/");
}
