/**
 * Turning a plan into an email (design §The workout email).
 *
 * Pure. Transport lives in ./mail-out.ts; everything about what the message
 * says and looks like is decided here, where it can be tested.
 *
 * Read top to bottom the way it is used in the gym:
 *
 * 1. What today is: the title, where it sits in the block, one line of why.
 * 2. What was understood from the last reply, so a misread can be corrected.
 * 3. The session, block by block, each exercise with today's number, last
 *    time's number and what changed between them.
 * 4. What to do if today feels off.
 * 5. Progress over the last seven days and since the block began.
 * 6. How to reply, for whoever wants to.
 * 7. How to do each movement, with pictures.
 *
 * The HTML body is what the phone renders, so colour separates the things
 * scanned for mid set. The plain text body is exact and complete, because it
 * is what any client without HTML falls back to, and it is wrapped to 50
 * characters so nothing breaks on a narrow screen.
 */

import { lastSeen, targetFor, type Brief, type Target } from "./coach";
import type { Pictured } from "./exercise-pictures";
import { mainExercises, plannedMinutes, type Plan, type PlanBlock, type PlanExercise } from "./plan";
import { kg } from "./progress";
import { BLOCK_WEEKS } from "./program";
import {
  bar,
  bestLine,
  title as titleCase,
  LABELS,
  PANEL_MUSCLES,
  trendLine,
  type Snapshot,
} from "./summary";
import { RULE, restText, wrap } from "./text";
import { dateOnly } from "./when";

/** A picture in the body, for the mailer to attach by Content-ID. */
export interface Inline {
  cid: string;
  /** The vendored file name. ./picture-library.ts knows where that is. */
  file: string;
  /** What the mail client calls it, if it ever shows it as a file. */
  filename: string;
}

export interface Composed {
  subject: string;
  text: string;
  html: string;
  /** Only the pictures the HTML actually refers to. */
  inline: Inline[];
}

export interface MailInput {
  plan: Plan;
  brief: Brief;
  slot: { startsAt: Date; minutes: number };
  snapshot: Snapshot | null;
  /** What was read from her last reply, as lines. */
  heard: string[];
  pictures?: Pictured[];
}

/**
 * The subject carries the date, which is what makes the subject-line fallback
 * worth having when a mail client omits In-Reply-To: two workouts a week apart
 * never share one.
 */
export function workoutSubject(plan: Plan, slot: { startsAt: Date }): string {
  return `${plan.title} · ${dateOnly(slot.startsAt)}`;
}

/** "Session 14 · Block 2, week 3 of 5" or "Lighter week". */
export function whereLine(brief: Brief): string {
  const week = brief.deload ? `lighter week` : `week ${brief.week} of ${BLOCK_WEEKS}`;
  const cycle = brief.cycleDay ? ` · Cycle day ${brief.cycleDay}` : "";
  return `Session ${brief.sessionNumber} · Block ${brief.block}, ${week}${cycle}`;
}

/** "4 x 8-12", "3 rounds", "30 sec". */
function setsReps(e: PlanExercise): string {
  if (e.sets > 0) return `${e.sets} x ${e.reps}`;
  return e.reps;
}

/** "72.5kg per hand · rest 2:30 · 2 in reserve, last set to failure". */
function loading(e: PlanExercise): string {
  const load = e.loadKg > 0 ? `${kg(e.loadKg)}${e.loadNote ? ` ${e.loadNote}` : ""}` : e.loadNote;
  const rest = e.restSec > 0 ? `rest ${restText(e.restSec)}` : "";
  const rir = e.rir >= 0 ? `${e.rir} in reserve` : "";
  const effort = e.lastSetToFailure ? [rir, "last set to failure"].filter(Boolean).join(", ") : rir;
  return [load, rest, effort].filter(Boolean).join(" · ");
}

function blockHeading(block: PlanBlock): string {
  const parts = [block.title || block.kind];
  if (block.minutes > 0) parts.push(`${block.minutes} min`);
  const simple = block.kind === "warmup" || block.kind === "cooldown";
  if (!simple && block.rounds > 1 && block.format !== "straight sets") parts.push(`${block.rounds} rounds`);
  return parts.join(" · ").toUpperCase();
}

export const OFF_DAY = [
  "Tired, slept badly, crampy or just flat? Keep the weights, drop the last set of each superset and leave one more rep in reserve.",
  "First set too easy, 2 or more reps past the top of the range? Add a step for the rest; starting too light is the commoner mistake. Missed the bottom of the range? Drop 5 to 10%.",
  "Failure means the next rep would not come up with good form. Heavy barbell lifts stop a rep or two before that, always.",
];

/**
 * How to reply, as an example built from today's own labels, so the format
 * is shown rather than described.
 */
export function replyExample(plan: Plan): string[] {
  // From the main work, where the numbers are progressed: the primer and the
  // finisher are not worth logging.
  const main = new Set(["strength", "superset", "circuit"]);
  const loaded = plan.blocks
    .filter((b) => main.has(b.kind))
    .flatMap((b) => b.exercises)
    .filter((e) => e.kind === "lift" && e.sets > 0)
    .slice(0, 2);
  const lines = loaded.map((e) => {
    const reps = e.reps.match(/\d+/g)?.map(Number) ?? [10];
    const top = reps.at(-1) ?? 10;
    const sets = Array.from({ length: Math.min(e.sets, 3) }, (_, i) => Math.max(1, top - (i === 2 ? 1 : 0)));
    return e.loadKg > 0 ? `${e.label} ${e.loadKg} x ${sets.join(" ")}` : `${e.label} ${sets.join(" ")}`;
  });
  return [...lines, "energy 4, fun 5", "Anything else, in your own words."];
}

/* ---------------- plain text ---------------- */

function textExercise(e: PlanExercise, target: Target | undefined): string[] {
  const head = `${e.label.padEnd(3)}${e.name}  ${setsReps(e)}`;
  const out = head.length <= 50 ? [head] : [...wrap(`${e.label} ${e.name}`, "   "), `   ${setsReps(e)}`];

  const load = loading(e);
  if (load) out.push(...wrap(load, "   ", "   "));
  if (e.cue) out.push(...wrap(e.cue, "   ", "   "));
  if (target) {
    out.push(...wrap(`Last ${lastSeen(target)}: ${target.last}`, "   ", "   "));
    if (target.action !== "hold") out.push(...wrap(target.reason, "   ", "   "));
  }
  return out;
}

function textBlock(block: PlanBlock, brief: Brief): string[] {
  const out = [blockHeading(block)];
  if (block.instructions) out.push(...wrap(block.instructions));

  const simple = block.kind === "warmup" || block.kind === "cooldown";
  for (const e of block.exercises) {
    if (simple) {
      out.push(...wrap(`${e.label.padEnd(3)}${titleCase(e.name)}, ${e.reps}${e.cue ? `. ${e.cue}` : ""}`, "   ", ""));
      continue;
    }
    out.push("", ...textExercise(e, targetFor(brief, e.name)));
  }
  return out;
}

function textProgress(s: Snapshot, brief: Brief): string[] {
  const out = ["THIS WEEK, COUNTING TODAY"];
  out.push(
    `Sessions ${s.sessions} · Hard sets ${s.hardSets} · Hard min ${s.hardMinutes}`,
    "",
  );

  for (const m of PANEL_MUSCLES) {
    const v = s.volume.find((x) => x.muscle === m);
    if (!v) continue;
    const label = LABELS[m].padEnd(11);
    const flag = v.status === "under" ? " low" : "";
    out.push(`${label}${bar(v.done, v.range[1])} ${v.done}/${v.range[0]}-${v.range[1]}${flag}`);
  }

  if (s.bests.length) {
    out.push("", "NEW BESTS");
    for (const b of s.bests.slice(0, 4)) out.push(...wrap(bestLine(b), "   ", "- "));
  }
  if (s.trends.length) {
    out.push("", `SINCE BLOCK ${brief.block} BEGAN`);
    for (const t of s.trends.slice(0, 4)) out.push(...wrap(trendLine(t), "   ", "- "));
  }
  return out;
}

function textHowTo(plan: Plan): string[] {
  const out = ["HOW TO DO THESE"];
  const seen = new Set<string>();
  for (const e of mainExercises(plan)) {
    if (seen.has(e.name) || !e.howTo) continue;
    seen.add(e.name);
    out.push("", e.name, ...wrap(e.howTo));
  }
  return out;
}


export function composeText(input: MailInput): string {
  const { plan, brief, slot } = input;
  const minutes = plannedMinutes(plan) || slot.minutes;

  const parts: string[][] = [
    [
      ...wrap(plan.title.toUpperCase()),
      ...wrap(whereLine(brief)),
      ...wrap(`${dateOnly(slot.startsAt)} · ${minutes} min · ${plan.focus}`),
      ...(plan.why ? ["", ...wrap(plan.why)] : []),
    ],
  ];

  if (input.heard.length) {
    parts.push(["FROM YOUR LAST REPLY", ...input.heard.flatMap((l) => wrap(l, "   ", "- "))]);
  }

  parts.push([RULE]);
  for (const block of plan.blocks) parts.push(textBlock(block, brief));
  parts.push([RULE]);

  parts.push(["IF TODAY FEELS OFF", ...OFF_DAY.flatMap((l) => wrap(l))]);
  if (input.snapshot) parts.push(textProgress(input.snapshot, brief));
  if (plan.tip) parts.push(["TIP", ...wrap(plan.tip)]);
  parts.push(["REPLY WITH WHAT YOU DID (optional)", ...replyExample(plan)]);
  parts.push(textHowTo(plan));

  return parts.map((p) => p.join("\n")).join("\n\n").trim() + "\n";
}

/* ---------------- HTML ---------------- */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/*
 * Colour by role, not decoration. Every value is set explicitly, including
 * backgrounds, because a mail client left to guess will invert the lot in dark
 * mode and put grey text on grey.
 */
const INK = "#1c1917";
const MUTED = "#57534e";
const FAINT = "#a8a29e";
/** The sets and reps. The one thing being looked for mid set. */
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ccfbf1";
/** Progress: a number went up. */
const UP = "#15803d";
/** A muscle that is behind. */
const WARN = "#b45309";
const RULE_COLOUR = "#e7e5e4";
const CARD = "#ffffff";
const PAGE = "#f5f5f4";
const TRACK = "#e7e5e4";

const KIND_COLOUR: Record<string, string> = {
  warmup: "#78716c",
  primer: "#7c3aed",
  strength: "#0f766e",
  superset: "#0369a1",
  circuit: "#0369a1",
  finisher: "#c2410c",
  core: "#4d7c0f",
  cooldown: "#78716c",
};

function label(text: string, colour = FAINT, margin = "0 0 10px"): string {
  return `<p style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${colour};margin:${margin}">${esc(text)}</p>`;
}

function htmlHeader(input: MailInput): string {
  const { plan, brief, slot } = input;
  const minutes = plannedMinutes(plan) || slot.minutes;
  return `
    ${label(whereLine(brief), FAINT, "0 0 6px")}
    <p style="font-size:24px;font-weight:800;line-height:1.2;color:${INK};margin:0 0 4px">${esc(plan.title)}</p>
    <p style="font-size:14px;line-height:1.5;color:${MUTED};margin:0 0 ${plan.why ? "12px" : "4px"}">
      ${esc(dateOnly(slot.startsAt))} · ${minutes} min · ${esc(plan.focus)}</p>
    ${plan.why ? `<p style="font-size:15px;line-height:1.55;color:${INK};margin:0;padding:10px 12px;background:${ACCENT_SOFT};border-radius:6px">${esc(plan.why)}</p>` : ""}`;
}

function htmlHeard(lines: string[]): string {
  if (lines.length === 0) return "";
  return `<div style="margin:16px 0 0;padding:10px 12px;border:1px solid ${RULE_COLOUR};border-radius:6px">
    ${label("From your last reply", FAINT, "0 0 6px")}
    ${lines.map((l) => `<p style="margin:0 0 3px;font-size:13px;line-height:1.45;color:${MUTED}">${esc(l)}</p>`).join("")}
    <p style="margin:6px 0 0;font-size:12px;line-height:1.4;color:${FAINT}">Wrong? Reply and say so.</p>
  </div>`;
}

function htmlTarget(target: Target | undefined): string {
  if (!target) return "";
  const colour = target.action === "up" ? UP : target.action === "drop" || target.action === "deload" || target.action === "reset" ? WARN : MUTED;
  const change = target.action !== "hold"
    ? `<br><span style="color:${colour};font-weight:600">${esc(target.reason)}</span>`
    : "";
  return `<p style="margin:5px 0 0;font-size:13px;line-height:1.45;color:${MUTED}">
    <span style="color:${FAINT}">Last ${esc(lastSeen(target))}</span> ${esc(target.last)}${change}</p>`;
}

/** Half the card each, so two frames fit a phone screen without scrolling. */
const PICTURE_WIDTH = 238;

function htmlPictures(name: string, pictured: Pictured | undefined): string {
  if (!pictured) return "";
  if (pictured.frames.length === 0) {
    return `<p style="margin:5px 0 0;font-size:12px;line-height:1.4;color:${FAINT}">No picture for this one.</p>`;
  }

  const frames = pictured.frames;
  const names = frames.length > 1 ? ["start", "finish"] : [""];
  const cells = frames
    .map((frame, at) => {
      const which = names[at] ?? `${at + 1}`;
      const alt = which ? `${name}, ${which}` : name;
      return `<td style="width:50%;padding:0 ${at === 0 && frames.length > 1 ? "4px" : "0"} 0 0;vertical-align:top">
        <img src="cid:${frame.cid}" alt="${esc(alt)}" width="${PICTURE_WIDTH}"
             style="display:block;width:100%;max-width:${PICTURE_WIDTH}px;height:auto;border:1px solid ${RULE_COLOUR};border-radius:6px;background:${PAGE}"></td>`;
    })
    .join("");

  const shows = pictured.shows
    ? `<p style="margin:4px 0 0;font-size:11px;line-height:1.4;color:${FAINT}">Shown: ${esc(pictured.shows)}</p>`
    : "";

  // table-layout:fixed, or the cells size to the pictures and the email ends
  // up wider than a narrow phone.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
                 style="margin:8px 0 0;width:100%;max-width:480px;table-layout:fixed;border-collapse:collapse">
            <tr>${cells}</tr></table>${shows}`;
}

function htmlExercise(e: PlanExercise, brief: Brief, pictured: Pictured | undefined): string {
  const load = loading(e);
  return `<div style="margin:0 0 ${pictured?.frames.length ? "20px" : "14px"}">
    <p style="margin:0;font-size:17px;line-height:1.35">
      <span style="color:${FAINT};font-weight:700">${esc(e.label)}</span>
      <span style="font-weight:700;color:${INK}">${esc(e.name)}</span>
      <span style="color:${ACCENT};font-weight:800;white-space:nowrap">${esc(setsReps(e))}</span></p>
    ${load ? `<p style="margin:2px 0 0;font-size:14px;line-height:1.45;color:${INK}">${esc(load)}</p>` : ""}
    ${e.cue ? `<p style="margin:2px 0 0;font-size:14px;line-height:1.45;color:${MUTED};font-style:italic">${esc(e.cue)}</p>` : ""}
    ${htmlTarget(targetFor(brief, e.name))}
    ${htmlPictures(e.name, pictured)}
  </div>`;
}

function htmlBlock(block: PlanBlock, brief: Brief, pictures: Map<string, Pictured>): string {
  const colour = KIND_COLOUR[block.kind] ?? ACCENT;
  const simple = block.kind === "warmup" || block.kind === "cooldown";

  const body = simple
    ? block.exercises
        .map(
          (e) =>
            `<p style="margin:0 0 5px;font-size:15px;line-height:1.5;color:${MUTED}"><span style="color:${FAINT}">${esc(e.label)}</span> ${esc(titleCase(e.name))}, ${esc(e.reps)}${e.cue ? `. ${esc(e.cue)}` : ""}</p>`,
        )
        .join("")
    : block.exercises
        .map((e) => htmlExercise(e, brief, pictures.get(e.name.trim().toUpperCase())))
        .join("");

  return `<div style="margin:22px 0 0;padding:0 0 0 12px;border-left:3px solid ${colour}">
    ${label(blockHeading(block), colour, "0 0 6px")}
    ${block.instructions ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${MUTED}">${esc(block.instructions)}</p>` : ""}
    ${body}
  </div>`;
}

/**
 * A bar as two table cells, filled and empty. Tables and background colours
 * are what every mail client agrees on; positioned elements are not.
 */
function htmlBar(done: number, range: [number, number], under: boolean): string {
  const width = Math.max(0, Math.min(100, Math.round((done / range[1]) * 100)));
  const fill = under ? WARN : ACCENT;
  const cell = (w: number, colour: string) =>
    w > 0 ? `<td style="width:${w}%;height:8px;background:${colour};padding:0;font-size:0;line-height:0">&nbsp;</td>` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed">
    <tr>${cell(width, fill)}${cell(100 - width, TRACK)}</tr></table>`;
}

function htmlProgress(s: Snapshot, brief: Brief): string {
  const rows = PANEL_MUSCLES.map((m) => {
    const v = s.volume.find((x) => x.muscle === m);
    if (!v) return "";
    const under = v.status === "under";
    return `<tr>
      <td style="width:28%;padding:3px 8px 3px 0;font-size:13px;color:${INK};white-space:nowrap">${esc(LABELS[m])}</td>
      <td style="padding:3px 8px 3px 0;vertical-align:middle">${htmlBar(v.done, v.range, under)}</td>
      <td style="width:22%;padding:3px 0;font-size:12px;color:${under ? WARN : MUTED};text-align:right;white-space:nowrap">${v.done} of ${v.range[0]}-${v.range[1]}</td>
    </tr>`;
  }).join("");

  const stat = (n: number | string, what: string) =>
    `<td style="width:33%;padding:0 6px 0 0;vertical-align:top">
       <p style="margin:0;font-size:22px;font-weight:800;color:${INK}">${esc(String(n))}</p>
       <p style="margin:0;font-size:11px;color:${FAINT};text-transform:uppercase;letter-spacing:.08em">${esc(what)}</p></td>`;

  const bests = s.bests.length
    ? `${label("New bests", UP, "14px 0 4px")}${s.bests.slice(0, 4).map((b) => `<p style="margin:0 0 3px;font-size:14px;color:${INK}">${esc(bestLine(b))}</p>`).join("")}`
    : "";
  const trends = s.trends.length
    ? `${label(`Since block ${brief.block} began`, FAINT, "14px 0 4px")}${s.trends.slice(0, 4).map((t) => `<p style="margin:0 0 3px;font-size:14px;color:${t.change > 0 ? UP : MUTED}">${esc(trendLine(t))}</p>`).join("")}`
    : "";

  return `<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${RULE_COLOUR}">
    ${label("This week, counting today")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px"><tr>
      ${stat(s.sessions, "sessions")}${stat(s.hardSets, "hard sets")}${stat(s.hardMinutes, "hard min")}
    </tr></table>
    <p style="margin:0 0 6px;font-size:12px;color:${FAINT}">Hard sets per muscle over 7 days, against the weekly target.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed">${rows}</table>
    ${bests}${trends}
  </div>`;
}

function htmlBox(heading: string, lines: string[], mono = false): string {
  return `<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${RULE_COLOUR}">
    ${label(heading)}
    ${lines.map((l) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${MUTED};${mono ? "font-family:ui-monospace,Menlo,monospace;color:" + INK : ""}">${esc(l)}</p>`).join("")}
  </div>`;
}

function htmlHowTo(plan: Plan): string {
  const seen = new Set<string>();
  const items = mainExercises(plan)
    .filter((e) => {
      if (seen.has(e.name) || !e.howTo) return false;
      seen.add(e.name);
      return true;
    })
    .map(
      (e) => `<div style="margin:0 0 14px">
        <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:${INK}">${esc(e.name)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:${MUTED}">${esc(e.howTo)}</p></div>`,
    )
    .join("");
  return `<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${RULE_COLOUR}">${label("How to do these")}${items}</div>`;
}

export function composeHtml(input: MailInput, pictures: Map<string, Pictured>): string {
  const { plan, brief } = input;
  return `
<div style="background:${PAGE};padding:12px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:34rem;margin:0 auto;background:${CARD};border:1px solid ${RULE_COLOUR};border-radius:10px;padding:18px;color:${INK}">
    ${htmlHeader(input)}
    ${htmlHeard(input.heard)}
    ${plan.blocks.map((b) => htmlBlock(b, brief, pictures)).join("")}
    ${htmlBox("If today feels off", OFF_DAY)}
    ${input.snapshot ? htmlProgress(input.snapshot, brief) : ""}
    ${plan.tip ? htmlBox("Tip", [plan.tip]) : ""}
    ${htmlBox("Reply with what you did (optional)", replyExample(plan), true)}
    ${htmlHowTo(plan)}
  </div>
</div>`;
}

/* ---------------- together ---------------- */

function byExercise(all: Pictured[]): Map<string, Pictured> {
  return new Map(all.map((one) => [one.exercise.trim().toUpperCase(), one]));
}

function inlineFor(plan: Plan, pictures: Map<string, Pictured>): Inline[] {
  const out: Inline[] = [];
  const seen = new Set<string>();
  for (const e of plan.blocks.filter((b) => b.kind !== "warmup" && b.kind !== "cooldown").flatMap((b) => b.exercises)) {
    const found = pictures.get(e.name.trim().toUpperCase());
    if (!found) continue;
    for (const [frame, picture] of found.frames.entries()) {
      if (seen.has(picture.cid)) continue;
      seen.add(picture.cid);
      out.push({
        cid: picture.cid,
        file: picture.file,
        filename: `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${frame + 1}.jpg`,
      });
    }
  }
  return out;
}

export function composeWorkoutMail(input: MailInput): Composed {
  const pictures = byExercise(input.pictures ?? []);
  return {
    subject: workoutSubject(input.plan, input.slot),
    text: composeText(input),
    html: composeHtml(input, pictures),
    inline: inlineFor(input.plan, pictures),
  };
}

/**
 * A workout from before plans were structured that still needs sending: a
 * retry that straddles the upgrade. Rare enough to send as it was written.
 */
export function composeLegacyMail(planText: string, slot: { startsAt: Date }): Composed {
  const text = planText.trim();
  return {
    subject: `Workout for ${dateOnly(slot.startsAt)}`,
    text,
    html: `<div style="background:${PAGE};padding:16px;font-family:ui-sans-serif,system-ui,sans-serif">
      <pre style="max-width:34rem;margin:0 auto;background:${CARD};padding:20px;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.7;white-space:pre-wrap;color:${INK}">${esc(text)}</pre></div>`,
    inline: [],
  };
}

