/**
 * The dynamic version of the workout email (AMP for Email), the one she uses.
 *
 * Pure. Gmail shows it to her because her account allows dynamic email from
 * the workout address (Settings, General, Dynamic email). Everything she taps
 * posts to /api/log through Gmail's own servers, so nothing on her phone opens
 * a link, which it cannot.
 *
 * Under each exercise: done, easy, hard, skip and undo, as one row of radio
 * pills in one form, so the last tap is the one that shows and the one that
 * counts; a swap that opens in place, with "did this instead"; and a line for
 * what changed. At the end: "all done" for everything not tapped, and a box
 * for anything else. A line at the top shows what is logged so far, read from
 * the server each time the email opens and after every save, because Gmail
 * forgets the pills' state when she leaves the email.
 *
 * Gmail drops a dynamic part that breaks any AMP for Email rule and shows the
 * plain HTML instead, so the rules are kept with care: no style attributes,
 * one amp-custom style, forms with method post and an https action-xhr, and
 * none of the attributes email refuses (workout-amp.test.mts checks).
 */

import { targetFor } from "./coach";
import type { Pictured } from "./exercise-pictures";
import type { PlanBlock, PlanExercise } from "./plan";
import { NOTE_MAX, WHOLE } from "./taps";
import { LABELS, PANEL_MUSCLES, title as titleCase } from "./summary";
import { dateOnly } from "./when";
import {
  blockHeading,
  COLOURS as C,
  CREDIT,
  details,
  dose,
  esc,
  isSimple,
  lastTime,
  picturedFor,
  subtitle,
  swapLine,
  type MailInput,
  type Unlogged,
} from "./workout-mail";

const PILLS: { how: string; text: string }[] = [
  { how: "done", text: "done" },
  { how: "easy", text: "easy" },
  { how: "hard", text: "hard" },
  { how: "skip", text: "skip" },
];

/** Safe for an id: letters and digits only. "B1'" becomes "B1x". */
const idOf = (label: string) => label.replace(/[^A-Za-z0-9]/g, "x");

const CSS = `
body{font-family:Arial,Helvetica,sans-serif;color:${C.ink};background-color:${C.page};margin:0;padding:10px}
.card{background-color:${C.card};border:1px solid ${C.rule};border-radius:10px;padding:16px;max-width:34rem}
.title{margin:0 0 2px;font-size:24px;font-weight:bold;line-height:1.2}
.sub{margin:0;font-size:13px;color:${C.faint}}
.logged{margin:6px 0 0;font-size:13px;color:${C.accent}}
.remind{margin:14px 0 0;padding:10px 12px;border:1px solid ${C.rule};border-radius:8px}
.remind p{margin:0 0 6px;font-size:14px;color:${C.muted}}
.inline{display:inline-block;margin:0 6px 0 0;vertical-align:top}
.block{margin:20px 0 0}
.heading{margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:1.5px;color:${C.accent}}
.how{margin:0 0 10px;font-size:13px;color:${C.muted}}
.warm{margin:0 0 4px;font-size:14px;color:${C.muted}}
.lab{color:${C.faint};font-weight:bold}
.ex{margin:0 0 22px}
.name{margin:0;font-size:16px;font-weight:bold;line-height:1.35}
.dose{margin:2px 0 0;font-size:14px;color:${C.muted}}
.dose b{color:${C.accent}}
.cue{margin:2px 0 0;font-size:13px;color:${C.muted};font-style:italic}
.last{margin:2px 0 0;font-size:13px;color:${C.faint}}
.up{color:${C.up}}
.down{color:${C.warn}}
.pics{margin:8px 0 0;width:100%;max-width:480px;border-collapse:collapse}
.pics td{width:50%;padding:0 4px 0 0;vertical-align:top}
.shows{margin:4px 0 0;font-size:11px;color:${C.faint}}
.howto{margin:6px 0 0;font-size:14px;color:${C.muted}}
.pills{margin:10px 0 0}
.r{-webkit-appearance:none;appearance:none;width:0;height:0;margin:0;padding:0;border:0}
.pill{display:inline-block;margin:0 4px 6px 0;padding:5px 12px;border:0;border-radius:999px;background-color:${C.pill};color:${C.muted};font-size:13px;font-family:Arial,Helvetica,sans-serif}
.r:checked + .pill{background-color:${C.accentSoft};color:${C.accent};font-weight:bold}
.undo{display:inline-block;margin:0 0 6px 4px;padding:5px 4px;font-size:12px;color:${C.faint}}
.r:checked + .undo{color:${C.muted}}
.swap{margin:2px 0 0}
.swap h4{margin:0;padding:2px 0;font-size:13px;font-weight:normal;color:${C.accent};background-color:${C.card};border:0}
.swapbody{margin:4px 0 0;padding:8px 10px;border-left:2px solid ${C.rule}}
.swapbody p{margin:0 0 6px;font-size:13px;color:${C.muted}}
.say{margin:4px 0 0;width:100%;border-collapse:collapse}
.say td{padding:0;vertical-align:middle}
.say .go{width:64px;padding:0 0 0 6px}
.box{width:100%;box-sizing:border-box;margin:0;padding:6px 8px;border:1px solid ${C.rule};border-radius:6px;font-size:14px;font-family:Arial,Helvetica,sans-serif;color:${C.ink};background-color:${C.card}}
.save{padding:4px 12px;border:1px solid ${C.accent};border-radius:6px;background-color:${C.card};color:${C.accent};font-size:13px;font-weight:bold}
.saved{margin:4px 0 0;font-size:13px;color:${C.up};font-weight:bold}
.failed{margin:4px 0 0;font-size:13px;color:${C.warn}}
.end{margin:24px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule}}
.label{margin:10px 0 4px;font-size:13px;color:${C.muted}}
.alldone{display:inline-block;padding:6px 16px;border:0;border-radius:999px;background-color:${C.accentSoft};color:${C.accent};font-size:14px;font-weight:bold}
.bars{margin:22px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule}}
.bars table{width:100%;table-layout:fixed;border-collapse:collapse}
.bars td{font-size:13px;padding:2px 0}
.bars .m{width:28%;color:${C.ink}}
.bars .n{width:22%;text-align:right;font-size:12px;color:${C.muted}}
.bars .low{color:${C.warn}}
.bars .track{padding:2px 8px}
.wide{margin:6px 0 0}
.credit{margin:12px 0 0;font-size:11px;color:${C.faint}}
`;

function action(input: MailInput, token = input.log!.token): string {
  return `${input.log!.base}/api/log?t=${encodeURIComponent(token)}`;
}

const RESULT = `<div submit-success><template type="amp-mustache"><p class="saved">Saved: {{saved}} &#10003;</p></template></div>
<div submit-error><template type="amp-mustache"><p class="failed">Didn't save. Try again.</p></template></div>`;

function pictures(input: MailInput, e: PlanExercise, pictured: Pictured | undefined): string {
  if (!pictured || pictured.frames.length === 0) {
    return e.howTo ? `<p class="howto">${esc(e.howTo)}</p>` : "";
  }
  const cells = pictured.frames
    .map(
      (f) =>
        `<td><amp-img src="${input.log!.base}/pictures/${f.source}/${encodeURIComponent(f.file)}" alt="${esc(e.name)}" width="${f.width}" height="${f.height}" layout="responsive"></amp-img></td>`,
    )
    .join("");
  const shows = pictured.shows ? `<p class="shows">Shown: ${esc(pictured.shows)}</p>` : "";
  return `<table class="pics" role="presentation"><tr>${cells}</tr></table>${shows}`;
}

function exercise(input: MailInput, e: PlanExercise): string {
  const id = idOf(e.label);
  const more = details(e);
  const last = lastTime(targetFor(input.brief, e.name, e.role));
  const radio = (how: string, text: string, cls: string) =>
    `<input class="r" type="radio" id="${id}-${how}" name="how" value="${how}" on="change:f-${id}.submit"><label for="${id}-${how}" class="${cls}">${esc(text)}</label>`;

  const swap = e.swap
    ? `<amp-accordion class="swap" animate>
<section>
<h4>Swap &#9662;</h4>
<div class="swapbody"><p>or: <b>${esc(swapLine(e))}</b></p>${radio("swap", "did this instead", "pill")}</div>
</section>
</amp-accordion>`
    : "";

  return `<div class="ex">
<p class="name"><span class="lab">${esc(e.label)}</span>&nbsp; ${esc(e.name)}</p>
<p class="dose"><b>${esc(dose(e))}</b>${more ? ` · ${esc(more)}` : ""}</p>
${e.cue ? `<p class="cue">${esc(e.cue)}</p>` : ""}
${last ? `<p class="last">${esc(last.last)}${last.change ? ` · <span class="${last.up ? "up" : "down"}">${esc(last.change)}</span>` : ""}</p>` : ""}
${pictures(input, e, picturedFor(input, e))}
<form id="f-${id}" method="post" action-xhr="${action(input)}" on="submit-success:logged.refresh">
<input type="hidden" name="ex" value="${esc(e.label)}">
<div class="pills">${PILLS.map((p) => radio(p.how, p.text, "pill")).join("")}${radio("clear", "undo", "undo")}</div>
${swap}
<table class="say" role="presentation"><tr><td><input class="box" type="text" name="note" maxlength="${NOTE_MAX}" placeholder="Changed something? e.g. 20kg 10 10 8"></td><td class="go"><button class="save" type="submit">Save</button></td></tr></table>
${RESULT}
</form>
</div>`;
}

function block(input: MailInput, b: PlanBlock): string {
  const body = isSimple(b)
    ? b.exercises
        .map((e) => `<p class="warm"><span class="lab">${esc(e.label)}</span> ${esc(titleCase(e.name))}, ${esc(e.reps)}${e.cue ? `. ${esc(e.cue)}` : ""}</p>`)
        .join("\n")
    : b.exercises.map((e) => exercise(input, e)).join("\n");
  return `<div class="block">
<p class="heading">${esc(blockHeading(b))}</p>
${b.instructions && !isSimple(b) ? `<p class="how">${esc(b.instructions)}</p>` : ""}
${body}
</div>`;
}

function whole(input: MailInput, how: string, text: string, token?: string, cls = "pill"): string {
  return `<form class="inline" method="post" action-xhr="${action(input, token)}"${token ? "" : ` on="submit-success:logged.refresh"`}>
<input type="hidden" name="ex" value="${WHOLE}"><input type="hidden" name="how" value="${how}">
<button class="${cls}" type="submit">${esc(text)}</button>
${RESULT}
</form>`;
}

function reminders(input: MailInput, list: Unlogged[]): string {
  if (list.length === 0) return "";
  return list
    .map(
      (u) => `<div class="remind">
<p>${esc(dateOnly(u.at))}, ${esc(u.title)}, isn't logged.</p>
${whole(input, "alldone", "all done", u.token)}
${whole(input, "skipall", "skipped it", u.token)}
</div>`,
    )
    .join("\n");
}

function bars(input: MailInput): string {
  if (!input.snapshot) return "";
  const cell = (w: number, colour: string) => (w > 0 ? `<td width="${w}%" height="8" bgcolor="${colour}"></td>` : "");
  const rows = PANEL_MUSCLES.map((m) => {
    const v = input.snapshot!.volume.find((x) => x.muscle === m);
    if (!v || v.range[1] === 0) return "";
    const under = v.status === "under";
    const width = Math.max(0, Math.min(100, Math.round((v.done / v.range[1]) * 100)));
    return `<tr><td class="m">${esc(LABELS[m])}</td><td class="track"><table role="presentation"><tr>${cell(width, under ? C.warn : C.accent)}${cell(100 - width, C.rule)}</tr></table></td><td class="n${under ? " low" : ""}">${v.done} of ${v.range[0]}-${v.range[1]}</td></tr>`;
  }).join("");
  return `<div class="bars">
<p class="heading">THIS WEEK</p>
<table role="presentation">${rows}</table>
</div>`;
}

export function composeAmp(input: MailInput): string {
  if (!input.log) return "";
  const { plan } = input;
  const drawn = plan.blocks.some((b) => b.exercises.some((e) => picturedFor(input, e)?.drawn));

  return `<!doctype html>
<html amp4email data-css-strict>
<head>
<meta charset="utf-8">
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script async custom-element="amp-accordion" src="https://cdn.ampproject.org/v0/amp-accordion-0.1.js"></script>
<script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script>
<script async custom-element="amp-list" src="https://cdn.ampproject.org/v0/amp-list-0.1.js"></script>
<script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script>
<style amp4email-boilerplate>body{visibility:hidden}</style>
<style amp-custom>${CSS}</style>
</head>
<body>
<div class="card">
<p class="title">${esc(plan.title)}</p>
<p class="sub">${esc(subtitle(input))}</p>
<amp-list id="logged" layout="fixed-height" height="40" src="${action(input)}" single-item items="." binding="no">
<template type="amp-mustache"><p class="logged">Logged: {{summary}}</p></template>
</amp-list>
${reminders(input, input.unlogged ?? [])}
${plan.blocks.map((b) => block(input, b)).join("\n")}
<div class="end">
${whole(input, "alldone", "All done", undefined, "alldone")}
<form method="post" action-xhr="${action(input)}" on="submit-success:logged.refresh">
<p class="label">Anything else about today?</p>
<input type="hidden" name="ex" value="${WHOLE}">
<textarea class="box" name="note" rows="3" maxlength="${NOTE_MAX}" placeholder="e.g. tired, had tabata yesterday, loved the swap"></textarea>
<p class="wide"><button class="save" type="submit">Save</button></p>
${RESULT}
</form>
</div>
${bars(input)}
${drawn ? `<p class="credit">${esc(CREDIT)}</p>` : ""}
</div>
</body>
</html>`;
}
