"use server";

import { revalidatePath } from "next/cache";
import { savePreferences } from "@/lib/preferences";
import { readJumpDays, readLevel, readPriorities } from "@/lib/profile";

export async function updatePreferences(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "").trim();

  const days = Number(form.get("trainingDaysPerWeek"));

  await savePreferences({
    goals: text("goals"),
    experience: text("experience"),
    level: readLevel(text("level")),
    // A nonsense value would otherwise reach the prompt as "NaN days a week".
    trainingDaysPerWeek: Number.isFinite(days) ? Math.min(Math.max(days, 1), 7) : 3,
    priorities: readPriorities(form.getAll("priorities").map(String)),
    avoid: text("avoid"),
    equipment: text("equipment"),
    enjoys: text("enjoys"),
    cycleTracking: form.get("cycleTracking") === "on",
    jumpDays: readJumpDays(form.get("jumpDays")),
    brief: text("brief"),
  });

  revalidatePath("/");
}
