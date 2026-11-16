/**
 * The dynamic workout email (AMP for Email), the one she taps in.
 *
 * Pure. Designed from scratch for a narrow phone: no frame, one column, big
 * targets. Nothing is ever typed except the comment: weight and reps sit on
 * the card already, − / + move them through weights that exist, and tapping
 * the weight opens a row of nearby weights so a big change is one tap. She
 * picks easy, done, hard or skip on each exercise (nothing is picked for
 * her), then one Save at the end logs them all with the numbers on the cards.
 *
 * Gmail silently shows the plain version instead of one that breaks any AMP
 * for Email rule, so the rules are kept with care (amp.test.mts checks): no
 * style attributes, one amp-custom style, forms post with action-xhr over
 * https, amp-bind only through amp-state and [text], [class] and [value],
 * and no links.
 */

import { kg } from "../training/equipment";
import type { Card, Mail, Numbers } from "./cards";
import { dose } from "./cards";

export const C = {
  ink: "#1F1D1A",
  muted: "#6E6862",
  faint: "#A39D96",
  rule: "#ECE7E1",
  paper: "#FFFFFF",
  chip: "#F4F1ED",
  accent: "#2F5D50",
  accentSoft: "#E2EDE8",
  warn: "#B4532A",
};

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
body{margin:0;padding:0 4px;background-color:${C.paper};color:${C.ink};font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif}
.top{padding:6px 0 12px}
.title{margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px}
.sub{margin:2px 0 0;font-size:14px;color:${C.muted}}
.logged{margin:6px 0 0;font-size:13px;color:${C.accent}}
.change{margin:0 0 8px;padding:8px 10px;background-color:${C.accentSoft};border-radius:10px;font-size:14px;line-height:1.35}
.change p{margin:0}
.ghost{margin:4px 0 0;padding:0;border:0;background-color:transparent;color:${C.accent};font-size:13px;font-weight:700}
.sec{margin:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:1.2px;color:${C.accent}}
.warm{margin:0;padding:0 0 4px;font-size:15px;line-height:1.5}
.warm .p{color:${C.muted}}
.card{padding:14px 0 12px;border-top:1px solid ${C.rule}}
.name{margin:0;font-size:18px;font-weight:700;line-height:1.25}
.meta{margin:2px 0 0;font-size:13px;color:${C.muted}}
.nums{margin:10px 0 0;width:100%;border-collapse:collapse}
.nums td{padding:0;vertical-align:middle}
.nums .gap{width:12px}
.step{width:38px;height:38px;padding:0;border:1px solid ${C.rule};border-radius:12px;background-color:${C.paper};color:${C.ink};font-size:20px;line-height:1}
.val{min-width:64px;padding:0 4px;border:0;background-color:transparent;color:${C.ink};font-size:20px;font-weight:700;text-align:center}
.unit{font-size:13px;font-weight:400;color:${C.muted}}
.what{margin:3px 0 0;font-size:12px;color:${C.faint}}
.row{display:none}
.row.open{display:block;margin:8px 0 0}
.chip{margin:0 6px 6px 0;padding:7px 11px;border:0;border-radius:999px;background-color:${C.chip};color:${C.ink};font-size:14px}
.chip.on{background-color:${C.accent};color:${C.paper};font-weight:700}
.effort{margin:8px 0 0;font-size:13px;color:${C.muted};font-style:italic}
.find{margin:8px 0 0;font-size:13px;color:${C.warn}}
.taps{margin:10px 0 0}
.r{-webkit-appearance:none;appearance:none;width:0;height:0;margin:0;padding:0;border:0}
.tap{display:inline-block;margin:0 6px 6px 0;padding:9px 18px;border-radius:999px;background-color:${C.chip};color:${C.ink};font-size:15px}
.r:checked + .tap{background-color:${C.accent};color:${C.paper};font-weight:700}
.saved{margin:6px 0 0;font-size:13px;color:${C.accent};font-weight:700}
.failed{margin:6px 0 0;font-size:13px;color:${C.warn};font-weight:700}
.more{margin:10px 0 0}
.more section{margin:0 0 2px}
.more h4{margin:0;padding:4px 0;border:0;background-color:${C.paper};color:${C.accent};font-size:14px;font-weight:700}
.inner{padding:8px 0 4px 12px;border-left:2px solid ${C.rule}}
.inner .name{font-size:16px}
.form{margin:0 0 8px;font-size:14px;line-height:1.4;color:${C.ink}}
.why{margin:0 0 8px;font-size:13px;color:${C.muted}}
.pics{width:100%;max-width:320px;border-collapse:collapse}
.pics td{width:50%;padding:0 4px 0 0;vertical-align:top}
.frame{border:1px solid ${C.rule};border-radius:8px}
.shows{margin:0 0 6px;font-size:13px;color:${C.muted};font-style:italic}
.hint{margin:8px 0 0;font-size:12px;color:${C.faint}}
.tap.skip{color:${C.muted}}
.end{margin:22px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule}}
.label{margin:0 0 6px;font-size:14px;color:${C.muted}}
.box{width:100%;box-sizing:border-box;margin:0;padding:10px;border:1px solid ${C.rule};border-radius:12px;font-size:15px;font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:${C.ink};background-color:${C.paper}}
.save{margin:8px 0 0;padding:9px 18px;border:1px solid ${C.accent};border-radius:999px;background-color:${C.paper};color:${C.accent};font-size:15px;font-weight:700}
.all{margin:14px 0 0;padding:12px 24px;border:0;border-radius:999px;background-color:${C.accent};color:${C.paper};font-size:16px;font-weight:700}
.week{margin:24px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule}}
.week table{width:100%;table-layout:fixed;border-collapse:collapse}
.week td{padding:3px 0;font-size:13px}
.week .m{width:28%}
.week .n{width:22%;text-align:right;color:${C.muted};white-space:nowrap}
.week .bar{padding:3px 8px}
.credit{margin:16px 0 0;font-size:11px;color:${C.faint}}
`;

const RESULT = `<div submit-success><template type="amp-mustache"><p class="saved">{{saved}} &#10003;</p></template></div>
<div submit-error><template type="amp-mustache"><p class="failed">Not saved, tap again</p></template></div>`;

/** A small form posting to this workout's log, for an undo. */
function form(mail: Mail, id: string, fields: Record<string, string>, body: string, refresh = true): string {
  const hidden = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
    .join("");
  return `<form id="${id}" method="post" action-xhr="${esc(mail.logUrl!)}"${refresh ? ` on="submit-success:logged.refresh"` : ""}>${hidden}${body}
${RESULT}
</form>`;
}

/**
 * The weight and reps with − / + and the row of nearby weights. `sid` names
 * its state; the bound hidden inputs carry the numbers into the one Save.
 */
function numbersBlock(card: Card, n: Numbers, sid: string): string {
  const weighted = n.weight !== null && n.steps.length > 0;
  const wi = weighted ? Math.max(0, n.steps.findIndex((s) => Math.abs(s - n.weight!) < 1e-9)) : 0;
  const ws = `${sid}w`;
  const last = n.steps.length - 1;
  const state = `<amp-state id="${sid}"><script type="application/json">${JSON.stringify({ w: wi, r: n.reps, o: false })}</script></amp-state>
${weighted ? `<amp-state id="${ws}"><script type="application/json">${JSON.stringify(n.steps)}</script></amp-state>` : ""}`;
  const set = (expr: string) => `AMP.setState({${sid}: {${expr}}})`;

  const weightCells = weighted
    ? `<td><button type="button" class="step" on="tap:${set(`w: max(${sid}.w - 1, 0)`)}">&minus;</button></td>
<td><button type="button" class="val" on="tap:${set(`o: !${sid}.o`)}"><span [text]="${ws}[${sid}.w]">${kg(n.weight!)}</span><span class="unit"> kg</span></button></td>
<td><button type="button" class="step" on="tap:${set(`w: min(${sid}.w + 1, ${last})`)}">+</button></td>
<td class="gap"></td>`
    : "";
  const repsCells = `<td><button type="button" class="step" on="tap:${set(`r: max(${sid}.r - 1, 1)`)}">&minus;</button></td>
<td><span class="val"><span [text]="${sid}.r">${n.reps}</span><span class="unit"> reps</span></span></td>
<td><button type="button" class="step" on="tap:${set(`r: min(${sid}.r + 1, 50)`)}">+</button></td>`;
  const row = weighted
    ? `<div class="row" [class]="${sid}.o ? 'row open' : 'row'">${n.steps
        .map(
          (s, i) =>
            `<button type="button" class="${i === wi ? "chip on" : "chip"}" [class]="${sid}.w == ${i} ? 'chip on' : 'chip'" on="tap:${set(`w: ${i}, o: false`)}">${kg(s)}</button>`,
        )
        .join("")}</div>`
    : "";
  const bound = `${weighted ? `<input type="hidden" name="w_${sid}" value="${kg(n.weight!)}" [value]="${ws}[${sid}.w]">` : ""}<input type="hidden" name="r_${sid}" value="${n.reps}" [value]="${sid}.r">`;

  return `${state}
<table class="nums" role="presentation"><tr>${weightCells}${repsCells}</tr></table>
<p class="what">${esc(n.weightLabel)}</p>
${row}
${n.findIt ? `<p class="find">First time: find a weight you could lift about 2 more times and set it above.</p>` : ""}
${bound}`;
}

/** Easy, done, hard or skip. Nothing is picked: an exercise counts only once she picks one. */
function taps(c: Card): string {
  return `<div class="taps">${(["easy", "done", "hard", "skip"] as const)
    .map(
      (t) =>
        `<input class="r" type="radio" id="${c.id}-${t}" name="t_${c.id}" value="${t}"><label class="${t === "skip" ? "tap skip" : "tap"}" for="${c.id}-${t}">${t}</label>`,
    )
    .join("")}</div>`;
}

function howTo(mail: Mail, n: Numbers, why?: string): string {
  const cells = mail.base
    ? n.frames
        .map(
          (f) =>
            `<td><div class="frame"><amp-img src="${esc(`${mail.base}/pictures/d/${encodeURIComponent(f.file)}`)}" alt="${esc(n.name)}" width="${f.width}" height="${f.height}" layout="responsive"></amp-img></div></td>`,
        )
        .join("")
    : "";
  if (!n.form && !cells) return "";
  return `<section>
<h4>How to &#9662;</h4>
<div class="inner">${n.form ? `<p class="form">${esc(n.form)}</p>` : ""}${cells && n.drawingNote ? `<p class="shows">${esc(n.drawingNote)}</p>` : ""}${cells ? `<table class="pics" role="presentation"><tr>${cells}</tr></table>` : ""}${why ? `<p class="why">${esc(why)}</p>` : ""}</div>
</section>`;
}

function card(mail: Mail, c: Card): string {
  const how = howTo(mail, c.main, c.why);
  const swap = c.swap
    ? `<section>
<h4>Swap &#9662;</h4>
<div class="inner"><p class="name">${esc(c.swap.name)}</p><p class="meta">${esc(dose(c.sets, c.swap.reps))}</p>
${numbersBlock(c, c.swap, `${c.id}s`)}
<input class="r" type="checkbox" id="${c.id}-swap" name="s_${c.id}" value="1"><label class="tap" for="${c.id}-swap">did this instead</label>
</div>
</section>`
    : "";
  return `<div class="card">
<input type="hidden" name="slot_${c.id}" value="${esc(c.slot)}">
<p class="name">${esc(c.main.name)}</p>
<p class="meta">${esc(`${c.muscle} · ${dose(c.sets, c.main.reps)} · rest ${c.rest}`)}</p>
${numbersBlock(c, c.main, c.id)}
<p class="effort">${esc(c.effort)}</p>
${taps(c)}
${swap || how ? `<amp-accordion class="more" animate>
${swap}
${how}
</amp-accordion>` : ""}
</div>`;
}

function changes(mail: Mail): string {
  return mail.changes
    .map(
      (ch, i) => `<div class="change"><p>${esc(ch.text)}</p>
${form(mail, `u${i + 1}`, { kind: "undo", id: ch.noteId }, `<button class="ghost" type="submit">undo</button>`, false)}
</div>`,
    )
    .join("\n");
}

function week(mail: Mail): string {
  if (!mail.summary.length) return "";
  const cell = (w: number, colour: string) => (w > 0 ? `<td width="${w}%" height="8" bgcolor="${colour}"></td>` : "");
  const rows = mail.summary
    .map((r) => {
      const scale = Math.max(r.target, r.done + r.today);
      const done = Math.round((r.done / scale) * 100);
      const today = Math.round((r.today / scale) * 100);
      return `<tr><td class="m">${esc(r.label)}</td><td class="bar"><table role="presentation"><tr>${cell(done, C.accent)}${cell(today, "#9DBDB2")}${cell(100 - done - today, C.rule)}</tr></table></td><td class="n">${r.done + r.today} / ${r.target}</td></tr>`;
    })
    .join("");
  return `<div class="week">
<p class="sec">THIS WEEK · SETS</p>
<table role="presentation">${rows}</table>
<p class="what">Dark is done since Sunday, light is today.</p>
</div>`;
}

export function composeAmp(mail: Mail): string {
  if (!mail.logUrl) return "";
  const work = mail.cards.filter((c) => !c.finisher);
  const abs = mail.cards.filter((c) => c.finisher);
  const pictured = mail.base && mail.cards.some((c) => c.main.frames.length);
  return `<!doctype html>
<html amp4email data-css-strict>
<head>
<meta charset="utf-8">
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script async custom-element="amp-accordion" src="https://cdn.ampproject.org/v0/amp-accordion-0.1.js"></script>
<script async custom-element="amp-bind" src="https://cdn.ampproject.org/v0/amp-bind-0.1.js"></script>
<script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script>
<script async custom-element="amp-list" src="https://cdn.ampproject.org/v0/amp-list-0.1.js"></script>
<script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script>
<style amp4email-boilerplate>body{visibility:hidden}</style>
<style amp-custom>${CSS}</style>
</head>
<body>
<div class="top">
<p class="title">${esc(mail.title)}</p>
<p class="sub">${esc(mail.sub)}</p>
<amp-list id="logged" layout="fixed-height" height="22" src="${esc(mail.logUrl)}" single-item items="." binding="no">
<template type="amp-mustache"><p class="logged">{{summary}}</p></template>
</amp-list>
</div>
${changes(mail)}
<p class="sec">WARM-UP · ${mail.warmupMinutes} MIN</p>
${mail.warmup.map((w) => `<p class="warm${w.practice ? " p" : ""}">${esc(w.text)}</p>`).join("\n")}
<form id="save" method="post" action-xhr="${esc(mail.logUrl)}" on="submit-success:logged.refresh">
<input type="hidden" name="kind" value="save">
<p class="sec">WORKOUT</p>
${work.map((c) => card(mail, c)).join("\n")}
${abs.length ? `<p class="sec">ABS</p>\n${abs.map((c) => card(mail, c)).join("\n")}` : ""}
<div class="end">
<p class="label">Anything about today?</p>
<textarea class="box" name="note" rows="3" maxlength="1000" placeholder="e.g. didn't feel the hip thrust in my glutes"></textarea>
<p class="hint">Only exercises with easy, done, hard or skip picked are saved. Saving again replaces them.</p>
<button class="all" type="submit">Save</button>
${RESULT}
</div>
</form>
${week(mail)}
${pictured ? `<p class="credit">Drawings: Everkinetic (everkinetic.com), CC BY-SA 4.0.</p>` : ""}
</body>
</html>`;
}
