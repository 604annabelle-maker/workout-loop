/**
 * The weekly review: one short email on Sunday morning about the week before.
 *
 * Pure. It says what happened, against what the week was aiming for, and what
 * next week is. No model writes it: every line is counted from the log, so it
 * costs nothing and is never wrong about a number.
 *
 * It is not a nag. A week with no training gets no email at all, and nothing
 * in it ever says "you missed".
 */

import { position, weekPlanFor, weeklyRange } from "./coach";
import type { Muscle } from "./plan";
import type { Preferences } from "./profile";
import {
  bestsBetween,
  DAY_MS,
  hardMinutesBetween,
  jumpsBetween,
  lastPeriodStart,
  setsPerMuscle,
  stalled,
  trendsBetween,
  type Session,
} from "./progress";
import { CONDITIONING, IMPACT } from "./program";
import { bar, bestLine, LABELS, PANEL_MUSCLES, title, trendLine } from "./summary";
import { RULE, wrap } from "./text";
import { dateOnly } from "./when";

/** Replies to the review are not read; a workout email is where a reply goes. */
export const FOOTER = "To log a session, reply to its workout email rather than this one.";

export interface ReviewInput {
  /** Every session in the log, any order. */
  sessions: Session[];
  preferences: Preferences;
  /** Midnight starting the week reviewed, and the one after it. */
  from: Date;
  to: Date;
}

export interface Review {
  subject: string;
  text: string;
  html: string;
}

interface Line {
  label: string;
  done: number;
  range: [number, number];
}

/** Everything the review says, as data, so the two bodies cannot disagree. */
export function reviewFacts(input: ReviewInput) {
  const { sessions, preferences, from, to } = input;
  const week = sessions
    .filter((s) => s.plan && s.at >= from && s.at < to)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const sets = setsPerMuscle(sessions, from, to);
  const muscles: Line[] = PANEL_MUSCLES.map((m: Muscle) => ({
    label: LABELS[m],
    done: Math.round((sets[m] ?? 0) * 2) / 2,
    range: weeklyRange(m, preferences),
  }));

  const ratings = week.flatMap((s) => s.logs.map((l) => l.checkIn));
  const fun = ratings.map((c) => c.enjoyment).filter((n) => n > 0);
  const energy = ratings.map((c) => c.energy).filter((n) => n > 0);
  const logged = week.filter((s) => s.logs.some((l) => l.exercises.length > 0)).length;

  // Noon on the Sunday the next week begins: where its sessions will sit.
  const pos = position(sessions, new Date(to.getTime() + 12 * 60 * 60 * 1000));
  const next = weekPlanFor(pos, sessions);

  const health: string[] = [];
  if (energy.filter((n) => n <= 2).length >= 2) {
    health.push(
      "Energy was low in more than one reply this week. The usual causes are not eating enough, especially carbohydrate around training, and short sleep. Worth a look before adding anything.",
    );
  }
  if (preferences.cycleTracking) {
    const start = lastPeriodStart(sessions);
    const daysSince = start ? Math.floor((to.getTime() - start.getTime()) / DAY_MS) : null;
    if (daysSince !== null && daysSince > 40) {
      health.push(
        `Your last logged period started ${daysSince} days ago. If that is longer than usual for you, it is worth mentioning to a doctor: a missing period can be a sign of under-fuelling, and that costs bone and muscle.`,
      );
    }
  }

  return {
    week,
    muscles,
    jumps: jumpsBetween(sessions, from, to),
    hardMinutes: hardMinutesBetween(sessions, from, to),
    bests: bestsBetween(sessions, from, to),
    trends: trendsBetween(sessions, pos.reEntry ? from : new Date(Math.min(from.getTime(), pos.blockStartedAt.getTime())), to)
      .filter((t) => t.change !== 0),
    stalled: stalled(sessions.filter((s) => s.at < to)),
    fun: fun.length ? Math.round((fun.reduce((a, b) => a + b, 0) / fun.length) * 10) / 10 : null,
    logged,
    next: next.deload
      ? "Next week is the lighter week: same sessions, about half the hard sets. It is where the last four weeks turn into muscle."
      : pos.week === 1 && pos.block === 1
        ? "Next week is the first week of the program. Loads start on the light side and are calibrated from what you reply."
        : pos.week === 1
          ? `Next week starts block ${pos.block}. Some accessories will change; the anchors that are still progressing stay.`
        : `Next week is week ${pos.week} of block ${pos.block}: ${next.plan.name}. ${next.plan.rir} on the main work.`,
    health,
  };
}

export function composeReview(input: ReviewInput): Review {
  const f = reviewFacts(input);
  const n = f.week.length;
  const bests = f.bests.length;

  const subject = `Your week: ${n} session${n === 1 ? "" : "s"}${bests ? `, ${bests} new best${bests === 1 ? "" : "s"}` : ""}`;

  const text: string[][] = [
    [`WEEK OF ${dateOnly(input.from).toUpperCase()}`, `${n} session${n === 1 ? "" : "s"}${f.fun !== null ? ` · fun ${f.fun}/5` : ""}`],
    f.week.map((s) => `- ${dateOnly(s.at)}: ${s.plan?.title ?? "Workout"}`),
    [RULE],
    [
      "HARD SETS PER MUSCLE",
      ...f.muscles.map(
        (m) => `${m.label.padEnd(11)}${bar(m.done, m.range[1])} ${m.done}/${m.range[0]}-${m.range[1]}`,
      ),
    ],
    [
      `Jumps ${f.jumps} (aim ${IMPACT.weekly[0]}-${IMPACT.weekly[1]})`,
      `Hard minutes ${f.hardMinutes} (aim ${CONDITIONING.weeklyHardMinutes[0]}-${CONDITIONING.weeklyHardMinutes[1]})`,
    ],
  ];

  if (f.bests.length) text.push(["NEW BESTS", ...f.bests.flatMap((b) => wrap(bestLine(b), "  ", "- "))]);
  if (f.trends.length) text.push(["THIS BLOCK SO FAR", ...f.trends.slice(0, 6).flatMap((t) => wrap(trendLine(t), "  ", "- "))]);
  if (f.stalled.length) {
    text.push([
      "STUCK",
      ...wrap(`${f.stalled.map(title).join(", ")}: no progress in three logged sessions. The next block will change the variation or the rep range.`),
    ]);
  }
  if (f.logged < n) {
    text.push(wrap(`${n - f.logged} of ${n} sessions had no numbers in a reply. Loads for those were progressed from what was written, which is a guess. A one line reply makes it exact.`));
  }
  text.push(["NEXT WEEK", ...wrap(f.next)]);
  if (f.health.length) text.push(["WORTH KNOWING", ...f.health.flatMap((h) => wrap(h))]);
  text.push(wrap(FOOTER));

  const body = text.map((p) => p.join("\n")).join("\n\n") + "\n";

  return { subject, text: body, html: reviewHtml(input, f) };
}

const INK = "#1c1917";
const MUTED = "#57534e";
const FAINT = "#a8a29e";
const ACCENT = "#0f766e";
const UP = "#15803d";
const WARN = "#b45309";
const RULE_COLOUR = "#e7e5e4";
const TRACK = "#e7e5e4";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function heading(t: string, colour = FAINT): string {
  return `<p style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${colour};margin:20px 0 8px">${esc(t)}</p>`;
}

function para(t: string, colour = MUTED): string {
  return `<p style="margin:0 0 6px;font-size:14px;line-height:1.55;color:${colour}">${esc(t)}</p>`;
}

function reviewHtml(input: ReviewInput, f: ReturnType<typeof reviewFacts>): string {
  const rows = f.muscles
    .map((m) => {
      const w = Math.max(0, Math.min(100, Math.round((m.done / m.range[1]) * 100)));
      const under = m.done < m.range[0];
      const cell = (width: number, colour: string) =>
        width > 0 ? `<td style="width:${width}%;height:8px;background:${colour};padding:0;font-size:0;line-height:0">&nbsp;</td>` : "";
      return `<tr>
        <td style="width:28%;padding:3px 8px 3px 0;font-size:13px;color:${INK}">${esc(m.label)}</td>
        <td style="padding:3px 8px 3px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>${cell(w, under ? WARN : ACCENT)}${cell(100 - w, TRACK)}</tr></table></td>
        <td style="width:22%;font-size:12px;color:${under ? WARN : MUTED};text-align:right;white-space:nowrap">${m.done} of ${m.range[0]}-${m.range[1]}</td></tr>`;
    })
    .join("");

  const n = f.week.length;
  return `
<div style="background:#f5f5f4;padding:12px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:34rem;margin:0 auto;background:#fff;border:1px solid ${RULE_COLOUR};border-radius:10px;padding:18px;color:${INK}">
    <p style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${FAINT};margin:0 0 6px">Week of ${esc(dateOnly(input.from))}</p>
    <p style="font-size:24px;font-weight:800;margin:0 0 8px">${n} session${n === 1 ? "" : "s"}${f.bests.length ? `, ${f.bests.length} new best${f.bests.length === 1 ? "" : "s"}` : ""}</p>
    ${f.week.map((s) => para(`${dateOnly(s.at)}: ${s.plan?.title ?? "Workout"}`)).join("")}
    ${f.fun !== null ? para(`Average fun rating ${f.fun} out of 5.`) : ""}
    ${heading("Hard sets per muscle")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed">${rows}</table>
    ${para(`Jumps ${f.jumps} (aim ${IMPACT.weekly[0]}-${IMPACT.weekly[1]}) · hard minutes ${f.hardMinutes} (aim ${CONDITIONING.weeklyHardMinutes[0]}-${CONDITIONING.weeklyHardMinutes[1]})`)}
    ${f.bests.length ? heading("New bests", UP) + f.bests.map((b) => para(bestLine(b), INK)).join("") : ""}
    ${f.trends.length ? heading("This block so far") + f.trends.slice(0, 6).map((t) => para(trendLine(t), t.change > 0 ? UP : MUTED)).join("") : ""}
    ${f.stalled.length ? heading("Stuck", WARN) + para(`${f.stalled.map(title).join(", ")}: no progress in three logged sessions. The next block will change the variation or the rep range.`) : ""}
    ${f.logged < n ? para(`${n - f.logged} of ${n} sessions had no numbers in a reply. Loads for those were progressed from what was written, which is a guess. A one line reply makes it exact.`, FAINT) : ""}
    ${heading("Next week")}${para(f.next, INK)}
    ${f.health.length ? heading("Worth knowing") + f.health.map((h) => para(h)).join("") : ""}
    <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${FAINT}">${esc(FOOTER)}</p>
  </div>
</div>`;
}
