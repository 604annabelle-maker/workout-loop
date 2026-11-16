"use server";

import { revalidatePath } from "next/cache";
import { readEquipment } from "@/training/equipment";
import { saveEquipment } from "@/training/history";

export async function updateEquipment(form: FormData) {
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
