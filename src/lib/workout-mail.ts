/**
 * Turning a plan into an email.
 *
 * Pure. Transport lives in ./mail-out.ts; what the message says and looks like
 * is decided here and in ./workout-amp.ts, where it can be tested.
 *
 * One email, three versions of it:
 * - the dynamic version (./workout-amp.ts), which is the one she uses: pills
 *   under each exercise to log it, a swap that opens in place, boxes to type
 *   in, all inside Gmail;
 * - this plain HTML version, which any other mail app shows, and Gmail shows
 *   once the dynamic one expires after 30 days: the same workout, logged by
 *   replying;
 * - plain text, for anything that shows neither.
 *
 * Fewer words, by her request: the exercises, what they weigh, last time's
 * number, the pictures while she is learning them, and the weekly bars.
 */

import { lastSeen, targetFor, type Brief, type Target } from "./coach";
import type { Frame, Pictured } from "./exercise-pictures";
import { mainExercises, plannedMinutes, type Plan, type PlanBlock, type PlanExercise } from "./plan";
import { kg } from "./progress";
import { BLOCK_WEEKS } from "./program";
import { bar, LABELS, PANEL_MUSCLES, title as titleCase, type Snapshot } from "./summary";
import { RULE, restText, wrap } from "./text";
import { dateOnly } from "./when";

/** A picture in the body, for the mailer to attach by Content-ID. */
export interface Inline {
  cid: string;
  source: Frame["source"];
  /** The vendored file name. ./picture-library.ts knows where that is. */
  file: string;
  /** What the mail client calls it, if it ever shows it as a file. */
  filename: string;
}

export interface Composed {
  subject: string;
  text: string;
  html: string;
  /** The dynamic version, when there is a way to log from it. */
  amp?: string;
  /** Only the pictures the HTML actually refers to. */
  inline: Inline[];
}

/** An earlier workout with nothing logged, which the email asks about. */
export interface Unlogged {
  at: Date;
  title: string;
  token: string;
}

export interface MailInput {
  plan: Plan;
  brief: Brief;
  slot: { startsAt: Date; minutes: number };
  snapshot: Snapshot | null;
  pictures?: Pictured[];
  /** Exercises still being learned, by name: these get their pictures. */
  learning?: Set<string>;
  /** Where the log buttons post, and this workout's secret. No dynamic version without it. */
  log?: { base: string; token: string } | null;
  unlogged?: Unlogged[];
}

/**
 * The subject carries the date, which is what makes the subject-line fallback
 * worth having when a mail client omits In-Reply-To: two workouts a week apart
 * never share one.
 */
export function workoutSubject(plan: Plan, slot: { startsAt: Date }): string {
  return `${plan.title} · ${dateOnly(slot.startsAt)}`;
}

/** "Tue 4 Nov · 60 min · week 2 of 5". */
export function subtitle(input: MailInput): string {
  const { plan, brief, slot } = input;
  const minutes = plannedMinutes(plan) || slot.minutes;
  const week = brief.deload ? "lighter week" : `week ${brief.week} of ${BLOCK_WEEKS}`;
  const cycle = brief.cycleDay ? ` · cycle day ${brief.cycleDay}` : "";
  return `${dateOnly(slot.startsAt)} · ${minutes} min · ${week}${cycle}`;
}

/** "4 × 5", "3 rounds", "30 sec". */
export function dose(e: PlanExercise): string {
  return e.sets > 0 ? `${e.sets} × ${e.reps}` : e.reps;
}

/** "Stop 2 short", "last set to failure". The effort in as few words as it takes. */
export function effort(e: PlanExercise): string {
  if (e.lastSetToFailure) return "last set to failure";
  if (e.rir === 0) return "to failure";
  if (e.rir > 0) return `stop ${e.rir} short`;
  return "";
}

/** "40kg · rest 3 min · stop 1 short". */
export function details(e: PlanExercise): string {
  const load = e.loadKg > 0 ? `${kg(e.loadKg)}${e.loadNote ? ` ${e.loadNote}` : ""}` : e.loadNote;
  const rest = e.restSec > 0 ? `rest ${restText(e.restSec)}` : "";
  return [load, rest, effort(e)].filter(Boolean).join(" · ");
}

/** "Last 37.5kg x 5, 5, 5, 5", and what changed, in its first sentence. */
export function lastTime(target: Target | undefined): { last: string; change: string; up: boolean } | null {
  if (!target) return null;
  const change = target.action === "hold" ? "" : (target.reason.match(/^[^.]*\./)?.[0] ?? target.reason);
  return { last: `Last ${target.last}`, change, up: target.action === "up" || target.action === "reps" };
}

/** "or: ONE-ARM CABLE ROW · 3 × 8 · 20kg". */
export function swapLine(e: PlanExercise): string {
  if (!e.swap) return "";
  const reps = e.swap.reps || e.reps;
  const load = e.swap.loadKg > 0 ? ` · ${kg(e.swap.loadKg)}${e.swap.loadNote ? ` ${e.swap.loadNote}` : ""}` : "";
  return `${e.swap.name} · ${e.sets > 0 ? `${e.sets} × ${reps}` : reps}${load}`;
}

/** "WARM UP · 7 min", "SUPERSET · 3 rounds". */
export function blockHeading(block: PlanBlock): string {
  const name = block.title || block.kind;
  const parts = [name];
  if (block.kind === "warmup" && block.minutes > 0) parts.push(`${block.minutes} min`);
  if (block.kind !== "warmup" && block.rounds > 1 && block.format !== "straight sets") parts.push(`${block.rounds} rounds`);
  return parts.join(" · ").toUpperCase();
}

export const isSimple = (block: PlanBlock) => block.kind === "warmup" || block.kind === "cooldown";

export const CREDIT = "Drawings: Everkinetic (everkinetic.com), CC BY-SA 4.0.";

/** The line that says how to log when there is nothing to tap. */
export const REPLY_HOW = "Log by replying: done, or only what was different, like: B1 hard 22 10 10 8, C1 skip.";

/* ---------------- plain text ---------------- */

function textExercise(e: PlanExercise, brief: Brief): string[] {
  const head = `${e.label.padEnd(3)}${e.name}  ${dose(e)}`;
  const out = head.length <= 50 ? [head] : [...wrap(`${e.label} ${e.name}`, "   "), `   ${dose(e)}`];
  const more = details(e);
  if (more) out.push(...wrap(more, "   ", "   "));
  if (e.cue) out.push(...wrap(e.cue, "   ", "   "));
  const last = lastTime(targetFor(brief, e.name, e.role));
  if (last) out.push(...wrap([last.last, last.change].filter(Boolean).join(" · "), "   ", "   "));
  if (e.swap) out.push(...wrap(`or: ${swapLine(e)}`, "   ", "   "));
  return out;
}

function textBlock(block: PlanBlock, brief: Brief): string[] {
  const out = [blockHeading(block)];
  if (block.instructions && !isSimple(block)) out.push(...wrap(block.instructions));
  for (const e of block.exercises) {
    if (isSimple(block)) {
      out.push(...wrap(`${e.label.padEnd(3)}${titleCase(e.name)}, ${e.reps}${e.cue ? `. ${e.cue}` : ""}`, "   ", ""));
      continue;
    }
    out.push("", ...textExercise(e, brief));
  }
  return out;
}

function textBars(s: Snapshot): string[] {
  const out = ["THIS WEEK"];
  for (const m of PANEL_MUSCLES) {
    const v = s.volume.find((x) => x.muscle === m);
    if (!v || v.range[1] === 0) continue;
    out.push(`${LABELS[m].padEnd(11)}${bar(v.done, v.range[1])} ${v.done}/${v.range[0]}-${v.range[1]}`);
  }
  return out;
}

export function composeText(input: MailInput): string {
  const { plan, brief } = input;
  const parts: string[][] = [[...wrap(plan.title.toUpperCase()), ...wrap(subtitle(input))], [RULE]];
  for (const block of plan.blocks) parts.push(textBlock(block, brief));
  parts.push([RULE]);
  if (input.snapshot) parts.push(textBars(input.snapshot));
  parts.push(wrap(REPLY_HOW));
  return parts.map((p) => p.join("\n")).join("\n\n").trim() + "\n";
}

/* ---------------- shared look ---------------- */

/*
 * Colour by role, not decoration. Every value is set explicitly, including
 * backgrounds, because a mail client left to guess will invert the lot in
 * dark mode and put grey text on grey.
 */
export const COLOURS = {
  ink: "#1c1917",
  muted: "#57534e",
  faint: "#a8a29e",
  accent: "#0f766e",
  accentSoft: "#ccfbf1",
  up: "#15803d",
  warn: "#b45309",
  rule: "#e7e5e4",
  card: "#ffffff",
  page: "#f5f5f4",
  pill: "#f5f5f4",
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/** The bars, as rows: a label, a bar of two table cells, the count. */
export function barRows(s: Snapshot, cell: (width: number, colour: string) => string): string {
  const c = COLOURS;
  return PANEL_MUSCLES.map((m) => {
    const v = s.volume.find((x) => x.muscle === m);
    if (!v || v.range[1] === 0) return "";
    const under = v.status === "under";
    const width = Math.max(0, Math.min(100, Math.round((v.done / v.range[1]) * 100)));
    return `<tr>
      <td style="width:25%;padding:3px 6px 3px 0;font-size:12px;color:${c.ink};white-space:nowrap">${esc(LABELS[m])}</td>
      <td style="padding:3px 6px 3px 0;vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>${cell(width, under ? c.warn : c.accent)}${cell(100 - width, c.rule)}</tr></table></td>
      <td style="width:23%;padding:3px 0;font-size:11px;color:${under ? c.warn : c.muted};text-align:right;white-space:nowrap">${v.done}/${v.range[0]}-${v.range[1]}</td>
    </tr>`;
  }).join("");
}

/* ---------------- plain HTML ---------------- */

const C = COLOURS;

function label(text: string, colour = C.faint, margin = "0 0 8px"): string {
  return `<p style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${colour};margin:${margin}">${esc(text)}</p>`;
}

/**
 * How it is done, in two sentences, while she is still learning it. The plain
 * version carries no pictures: two side by side were too small to see on her
 * phone, and it cannot hide them behind a tap the way the dynamic one does.
 */
function htmlHowTo(input: MailInput, e: PlanExercise): string {
  if (!e.howTo || !input.learning?.has(e.name.trim().toUpperCase())) return "";
  return `<p style="margin:4px 0 0;font-size:13px;line-height:1.45;color:${C.muted}">${esc(e.howTo)}</p>`;
}

function htmlExercise(input: MailInput, e: PlanExercise): string {
  const more = details(e);
  const last = lastTime(targetFor(input.brief, e.name, e.role));
  const swap = swapLine(e);
  return `<div style="margin:0 0 18px">
    <p style="margin:0;font-size:16px;line-height:1.35"><span style="color:${C.faint};font-weight:700">${esc(e.label)}</span>&nbsp; <span style="font-weight:700;color:${C.ink}">${esc(e.name)}</span></p>
    <p style="margin:2px 0 0;font-size:14px;line-height:1.45;color:${C.muted}"><span style="color:${C.accent};font-weight:800">${esc(dose(e))}</span>${more ? ` · ${esc(more)}` : ""}</p>
    ${e.cue ? `<p style="margin:2px 0 0;font-size:13px;line-height:1.45;color:${C.muted};font-style:italic">${esc(e.cue)}</p>` : ""}
    ${last ? `<p style="margin:2px 0 0;font-size:13px;line-height:1.45;color:${C.faint}">${esc(last.last)}${last.change ? ` · <span style="color:${last.up ? C.up : C.warn}">${esc(last.change)}</span>` : ""}</p>` : ""}
    ${htmlHowTo(input, e)}
    ${swap ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.45;color:${C.faint}">or: ${esc(swap)}</p>` : ""}
  </div>`;
}

function htmlBlock(input: MailInput, block: PlanBlock): string {
  const body = isSimple(block)
    ? block.exercises
        .map(
          (e) =>
            `<p style="margin:0 0 4px;font-size:14px;line-height:1.5;color:${C.muted}"><span style="color:${C.faint}">${esc(e.label)}</span> ${esc(titleCase(e.name))}, ${esc(e.reps)}${e.cue ? `. ${esc(e.cue)}` : ""}</p>`,
        )
        .join("")
    : block.exercises.map((e) => htmlExercise(input, e)).join("");
  return `<div style="margin:20px 0 0">
    ${label(blockHeading(block), C.accent, "0 0 8px")}
    ${block.instructions && !isSimple(block) ? `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${C.muted}">${esc(block.instructions)}</p>` : ""}
    ${body}
  </div>`;
}

function htmlBars(s: Snapshot): string {
  const cell = (w: number, colour: string) =>
    w > 0 ? `<td style="width:${w}%;height:8px;background:${colour};padding:0;font-size:0;line-height:0">&nbsp;</td>` : "";
  return `<div style="margin:22px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule}">
    ${label("This week")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed">${barRows(s, cell)}</table>
  </div>`;
}

export function composeHtml(input: MailInput): string {
  const { plan } = input;
  // No frame around it: on a small phone a border and padding only take room.
  return `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:${C.card};color:${C.ink}">
  <div style="max-width:34rem">
    <p style="font-size:24px;font-weight:800;line-height:1.2;color:${C.ink};margin:0 0 4px">${esc(plan.title)}</p>
    <p style="font-size:13px;line-height:1.5;color:${C.faint};margin:0">${esc(subtitle(input))}</p>
    ${plan.blocks.map((b) => htmlBlock(input, b)).join("")}
    ${input.snapshot ? htmlBars(input.snapshot) : ""}
    <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${C.muted}">${esc(REPLY_HOW)}</p>
  </div>
</div>`;
}

/* ---------------- together ---------------- */

export function composeWorkoutMail(input: MailInput, amp?: (input: MailInput) => string): Composed {
  return {
    subject: workoutSubject(input.plan, input.slot),
    text: composeText(input),
    html: composeHtml(input),
    ...(amp && input.log ? { amp: amp(input) } : {}),
    // The pictures are only in the dynamic version, loaded from the app.
    inline: [],
  };
}

/**
 * A workout from before plans were structured that still needs sending: a
 * retry that straddles an upgrade. Rare enough to send as it was written.
 */
export function composeLegacyMail(planText: string, slot: { startsAt: Date }): Composed {
  const text = planText.trim();
  return {
    subject: `Workout for ${dateOnly(slot.startsAt)}`,
    text,
    html: `<div style="background:${C.page};padding:16px;font-family:ui-sans-serif,system-ui,sans-serif">
      <pre style="max-width:34rem;margin:0 auto;background:${C.card};padding:20px;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.7;white-space:pre-wrap;color:${C.ink}">${esc(text)}</pre></div>`,
    inline: [],
  };
}

export { lastSeen };
