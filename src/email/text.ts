/**
 * The plain text workout email, wrapped to 50 characters.
 *
 * Pure. Exact and complete, for any client that shows only text.
 */

import { RULE, wrap } from "../lib/text";
import { kg } from "../training/equipment";
import { dose, REPLY_HELP, weightText, type Card, type Mail } from "./cards";

function card(c: Card): string[] {
  const n = c.main;
  const lines = [
    ...wrap(n.name.toUpperCase()),
    ...wrap(`${dose(c.sets, n.reps)} · ${n.weight === null ? n.weightLabel : `${kg(n.weight)} kg`} · rest ${c.rest}`, "  ", "  "),
  ];
  if (n.weight !== null) lines.push(...wrap(weightText(n), "  ", "  "));
  lines.push(...wrap(c.effort, "  ", "  "));
  if (n.form) lines.push(...wrap(n.form, "  ", "  "));
  if (c.swap) lines.push(...wrap(`Swap: ${c.swap.name}, ${dose(c.sets, c.swap.reps)}, ${weightText(c.swap)}`, "  ", "  "));
  return lines;
}

export function composeText(mail: Mail): string {
  const out: string[] = [...wrap(mail.title.toUpperCase()), ...wrap(mail.sub), ""];
  for (const ch of mail.changes) out.push(...wrap(ch.text), "");
  out.push(`WARM-UP · ${mail.warmupMinutes} MIN`, RULE);
  for (const w of mail.warmup) out.push(...wrap(w.text, "  ", "- "));
  out.push("", "WORKOUT", RULE);
  for (const c of mail.cards.filter((x) => !x.finisher)) out.push(...card(c), "");
  const abs = mail.cards.filter((x) => x.finisher);
  if (abs.length) {
    out.push("ABS", RULE);
    for (const c of abs) out.push(...card(c), "");
  }
  out.push(RULE, ...REPLY_HELP.flatMap((l) => wrap(l)));
  if (mail.summary.length) {
    out.push("", "THIS WEEK · SETS", RULE);
    for (const r of mail.summary) out.push(`${r.label.padEnd(12)} ${String(r.done + r.today).padStart(4)} / ${r.target}`);
  }
  return out.join("\n") + "\n";
}
