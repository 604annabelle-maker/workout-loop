/**
 * The dynamic workout email (AMP for Email), the one she taps in.
 *
 * Pure. Designed from scratch for a narrow phone: no frame, one column, big
 * targets. Nothing is ever typed except the comment: weight and reps sit on
 * the card already, − / + move them through weights that exist, and tapping
 * the weight opens a row of nearby weights so a big change is one tap. She
 * sets the numbers to what she did and skips what she did not do (the card
 * folds to one line, with a way to bring it back); one Save
 * at the end logs every card that is not skipped (her reply, 19 Nov 2026: no
 * easy, done or hard).
 *
 * Every tap is also saved as she goes (draft.ts), because Gmail forgets the
 * email's state when it closes. Coming back, one tap at the top brings it
 * all back: an email cannot load state by itself.
 *
 * An exercise's drawing opens from a small arrow by its name, as the
 * warm-up's do, and the swap's from its own name inside Swap.
 *
 * Gmail silently shows the plain version instead of one that breaks any AMP
 * for Email rule, so the rules are kept with care (amp.test.mts checks): no
 * style attributes, one amp-custom style, forms post with action-xhr over
 * https, amp-bind only through amp-state and [text], [class] and [value],
 * and no links.
 */

import { kg } from "../training/equipment";
import type { Card, Frame, Mail, Numbers } from "./cards";
import { dose } from "./cards";
import { indexOf } from "./draft";

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
.logged{display:inline-block;margin:6px 0 0;font-size:13px;color:${C.accent}}
.change{margin:0 0 8px;padding:8px 10px;background-color:${C.accentSoft};border-radius:10px;font-size:14px;line-height:1.35}
.change p{margin:0}
.ghost{margin:4px 0 0;padding:0;border:0;background-color:transparent;color:${C.accent};font-size:13px;font-weight:700}
.sec{margin:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:1.2px;color:${C.accent}}
.warm{margin:0;padding:0 0 4px;font-size:15px;line-height:1.5}
.warm.p{color:${C.muted}}
.warmups section{margin:0}
.warmups h4{margin:0;padding:2px 0;border:0;background-color:${C.paper};font-size:15px;font-weight:400;line-height:1.5;color:${C.ink}}
.warmups h4.p{color:${C.muted}}
.card{padding:14px 0 12px;border-top:1px solid ${C.rule}}
.name{margin:0;font-size:18px;font-weight:700;line-height:1.25}
.look section{margin:0}
.look h4{margin:0;padding:0;border:0;background-color:${C.paper};color:${C.ink};font-size:18px;font-weight:700;line-height:1.25}
.inner .look h4{font-size:16px}
.arrow{font-size:13px;font-weight:400;color:${C.muted}}
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
.gone{display:none}
.skipline{margin:0;font-size:14px;color:${C.muted}}
.skipline .ghost{margin:0;font-size:14px}
.tap{display:inline-block;margin:0 6px 6px 0;padding:9px 18px;border:0;border-radius:999px;background-color:${C.chip};color:${C.ink};font-size:15px}
.tap.on{background-color:${C.accent};color:${C.paper};font-weight:700}
.resume{margin:6px 8px 0 0;padding:7px 14px;border:1px solid ${C.accent};border-radius:999px;background-color:${C.paper};color:${C.accent};font-size:14px;font-weight:700}
.saved{margin:6px 0 0;font-size:13px;color:${C.accent};font-weight:700}
.failed{margin:6px 0 0;font-size:13px;color:${C.warn};font-weight:700}
.more{margin:10px 0 0}
.more section{margin:0 0 2px}
.more>section>h4{margin:0;padding:4px 0;border:0;background-color:${C.paper};color:${C.accent};font-size:14px;font-weight:700}
.inner{padding:8px 0 4px 12px;border-left:2px solid ${C.rule}}
.inner .name{font-size:16px}
.pics{width:100%;max-width:320px;border-collapse:collapse}
.pics td{width:50%;padding:0 4px 0 0;vertical-align:top}
.frame{border:1px solid ${C.rule};border-radius:8px}
.hint{margin:8px 0 0;font-size:12px;color:${C.faint}}
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
 * Every change also posts the draft (`draftForm`), so closing Gmail loses
 * nothing.
 */
function numbersBlock(card: Card, n: Numbers, sid: string): string {
  const weighted = n.weight !== null && n.steps.length > 0;
  const wi = weighted ? indexOf(n.weight, n.steps) : 0;
  const ws = `${sid}w`;
  const last = n.steps.length - 1;
  const main = sid === card.id;
  const state = `<amp-state id="${sid}"><script type="application/json">${JSON.stringify(main ? { w: wi, r: n.reps, o: false, k: false, s: false } : { w: wi, r: n.reps, o: false })}</script></amp-state>
${weighted ? `<amp-state id="${ws}"><script type="application/json">${JSON.stringify(n.steps)}</script></amp-state>` : ""}`;
  const set = (expr: string) => keep(card, `${sid}: {${expr}}`);

  const weightCells = weighted
    ? `<td><button type="button" class="step" on="tap:${set(`w: max(${sid}.w - 1, 0)`)}">&minus;</button></td>
<td><button type="button" class="val" on="tap:AMP.setState({${sid}: {o: !${sid}.o}})"><span [text]="${ws}[${sid}.w]">${kg(n.weight!)}</span><span class="unit"> kg</span></button></td>
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

/** Set state, say which card she touched, then post the draft. */
const keep = (c: Card, state: string) => `AMP.setState({${state}, cur: {c: '${c.id}'}}), draft.submit`;

/** A chip that toggles one of the card's flags, sent with the Save as 1 or nothing. */
function toggle(c: Card, key: "s", off: string, on: string): string {
  const f = `${c.id}.${key}`;
  return `<button type="button" class="tap" [class]="${f} ? 'tap on' : 'tap'" on="tap:${keep(c, `${c.id}: {${key}: !${f}}`)}"><span [text]="${f} ? '${on}' : '${off}'">${off}</span></button>
<input type="hidden" name="${key}_${c.id}" value="" [value]="${f} ? '1' : ''">`;
}

/** The drawing, two frames small and side by side. */
function pics(mail: Mail, frames: Frame[], name: string): string {
  if (!mail.base || !frames.length) return "";
  const cells = frames
    .map(
      (f) =>
        `<td><div class="frame"><amp-img src="${esc(`${mail.base}/pictures/d/${encodeURIComponent(f.file)}`)}" alt="${esc(name)}" width="${f.width}" height="${f.height}" layout="responsive"></amp-img></div></td>`,
    )
    .join("");
  return `<table class="pics" role="presentation"><tr>${cells}</tr></table>`;
}

/** An exercise's name with a small arrow that drops its drawing down, as the warm-up does. No drawing: the name alone. */
function named(mail: Mail, n: Numbers): string {
  const p = pics(mail, n.frames, n.name);
  return p
    ? `<amp-accordion class="look" animate>\n<section>\n<h4>${esc(n.name)} <span class="arrow">&#9662;</span></h4>\n<div class="inner">${p}</div>\n</section>\n</amp-accordion>`
    : `<p class="name">${esc(n.name)}</p>`;
}

/** The warm-up: each line opens on its drawing. */
function warmup(mail: Mail): string {
  const sections = mail.warmup
    .map((w) => {
      const p = pics(mail, w.frames, w.name);
      return p
        ? `<section>\n<h4 class="warm${w.practice ? " p" : ""}">${esc(w.text)} &#9662;</h4>\n<div class="inner">${p}</div>\n</section>`
        : "";
    })
    .filter(Boolean);
  const plain = mail.warmup.filter((w) => !pics(mail, w.frames, w.name)).map((w) => `<p class="warm${w.practice ? " p" : ""}">${esc(w.text)}</p>`);
  return `${sections.length ? `<amp-accordion class="warmups" animate>\n${sections.join("\n")}\n</amp-accordion>` : ""}${plain.join("\n")}`;
}

function card(mail: Mail, c: Card): string {
  const swap = c.swap
    ? `<amp-accordion class="more" animate>
<section>
<h4>Swap &#9662;</h4>
<div class="inner">${named(mail, c.swap)}
<p class="meta">${esc(dose(c.sets, c.swap.reps))}</p>
${numbersBlock(c, c.swap, `${c.id}s`)}
<div class="taps">${toggle(c, "s", "did this instead", "did this instead ✓")}</div>
</div>
</section>
</amp-accordion>`
    : "";
  const k = `${c.id}.k`;
  return `<div class="card">
<input type="hidden" name="slot_${c.id}" value="${esc(c.slot)}">
<input type="hidden" name="k_${c.id}" value="" [value]="${k} ? '1' : ''">
<p class="gone" [class]="${k} ? 'skipline' : 'gone'">Skipped ${esc(c.main.name)} · <button type="button" class="ghost" on="tap:${keep(c, `${c.id}: {k: false}`)}">bring back</button></p>
<div [class]="${k} ? 'gone' : ''">
${named(mail, c.main)}
<p class="meta">${esc(`${c.muscle} · ${dose(c.sets, c.main.reps)} · rest ${c.rest}`)}</p>
${numbersBlock(c, c.main, c.id)}
<p class="effort">${esc(c.effort)}</p>
<div class="taps"><button type="button" class="tap" on="tap:${keep(c, `${c.id}: {k: true}`)}">skip</button></div>
${swap}
</div>
</div>`;
}

/**
 * The draft: the whole email's state, posted on every tap (draft.ts). Outside
 * the Save form, since forms cannot nest. `cur` says which card was touched
 * and whether the email shows the draft (`b`, set by picking up).
 */
function draftForm(mail: Mail): string {
  const h = (name: string, value: string | number, bind: string) => `<input type="hidden" name="${name}" value="${value}" [value]="${bind}">`;
  const cards = mail.cards.map((c) => {
    const n = c.main;
    return `${h(`${c.id}w`, indexOf(n.weight, n.steps), `${c.id}.w`)}${h(`${c.id}r`, n.reps, `${c.id}.r`)}${h(`${c.id}k`, 0, `${c.id}.k ? 1 : 0`)}${h(`${c.id}s`, 0, `${c.id}.s ? 1 : 0`)}${
      c.swap ? `${h(`${c.id}sw`, indexOf(c.swap.weight, c.swap.steps), `${c.id}s.w`)}${h(`${c.id}sr`, c.swap.reps, `${c.id}s.r`)}` : ""
    }`;
  });
  return `<amp-state id="cur"><script type="application/json">{"c":"","b":false}</script></amp-state>
<form id="draft" method="post" action-xhr="${esc(mail.logUrl!)}">
<input type="hidden" name="kind" value="draft">${h("card", "", "cur.c")}${h("back", 0, "cur.b ? 1 : 0")}
${cards.join("\n")}
</form>`;
}

/**
 * The top line: what is saved, and, once she has set anything, the button
 * that brings it back. Its answer is the whole email's state (draft.ts).
 */
function resume(mail: Mail): string {
  const keys = mail.cards.flatMap((c) => [c.id, ...(c.swap ? [`${c.id}s`] : [])]);
  const set = [...keys.map((k) => `${k}: event.response.${k}`), "nt: event.response.nt", "nr: event.response.nt", "cur: event.response.cur"].join(", ");
  return `<form id="restore" method="post" action-xhr="${esc(mail.logUrl!)}" on="submit-success:AMP.setState({${set}})">
<input type="hidden" name="kind" value="restore">
<amp-list id="logged" layout="fixed-height" height="44" src="${esc(mail.logUrl!)}" single-item items="." binding="no">
<template type="amp-mustache">{{#draft}}<button class="resume" type="submit">&#8634; Pick up where you left off</button>{{/draft}}<p class="logged">{{summary}}</p></template>
</amp-list>
<div submit-success><template type="amp-mustache"><p class="saved">{{saved}} &#10003;</p></template></div>
<div submit-error><template type="amp-mustache"><p class="failed">Couldn't load it, tap again</p></template></div>
</form>`;
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
${resume(mail)}
</div>
${changes(mail)}
<p class="sec">WARM-UP · ${mail.warmupMinutes} MIN</p>
${warmup(mail)}
<form id="save" method="post" action-xhr="${esc(mail.logUrl)}" on="submit-success:logged.refresh">
<input type="hidden" name="kind" value="save">
<p class="sec">WORKOUT</p>
${work.map((c) => card(mail, c)).join("\n")}
${abs.length ? `<p class="sec">ABS</p>\n${abs.map((c) => card(mail, c)).join("\n")}` : ""}
<div class="end">
<p class="label">Anything about today?</p>
<amp-state id="nt"><script type="application/json">{"t":""}</script></amp-state>
<amp-state id="nr"><script type="application/json">{"t":""}</script></amp-state>
<textarea class="box" name="note" rows="3" maxlength="1000" placeholder="e.g. didn't feel the hip thrust in my glutes" [text]="nr.t" on="input-debounced:AMP.setState({nt: {t: event.value}}), dnote.submit"></textarea>
<p class="hint">Everything you set is kept as you go, even if Gmail closes. Save when you finish: it logs every exercise as it shows, except the ones you skipped. Saving again replaces it.</p>
<button class="all" type="submit">Save</button>
${RESULT}
</div>
</form>
${draftForm(mail)}
<form id="dnote" method="post" action-xhr="${esc(mail.logUrl)}"><input type="hidden" name="kind" value="note"><input type="hidden" name="note" value="" [value]="nt.t"></form>
${week(mail)}
${pictured ? `<p class="credit">Drawings: Everkinetic (everkinetic.com), CC BY-SA 4.0.</p>` : ""}
</body>
</html>`;
}
