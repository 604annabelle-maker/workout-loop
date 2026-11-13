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

export async function updateEquipment(form: FormData) {
  const { readEquipment } = await import("@/training/equipment");
  const { saveEquipment } = await import("@/training/history");
  const machines: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("machine_")) machines[k.slice("machine_".length)] = String(v);
  await saveEquipment(
    readEquipment({
      dumbbells: String(form.get("dumbbells") ?? ""),
      barbell: form.get("barbell"),
      ezbar: form.get("ezbar"),
      plates: String(form.get("plates") ?? ""),
      cable: String(form.get("cable") ?? ""),
      machine: String(form.get("machine") ?? ""),
      machines,
      missing: form.getAll("missing").map(String),
    }),
  );
  revalidatePath("/");
}
