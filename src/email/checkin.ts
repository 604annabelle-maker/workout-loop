/**
 * The monthly check-in email (spec §The monthly check-in).
 *
 * Pure. Three quick taps and a comment. Each tap saves on its own, so she
 * can answer one and leave the rest.
 */

import { C, esc } from "./amp";

export const QUESTIONS = [
  { name: "enjoying", text: "Enjoying it?", options: [["yes", "yes"], ["meh", "meh"], ["no", "no"]] },
  { name: "length", text: "Session length?", options: [["too_short", "too short"], ["right", "right"], ["too_long", "too long"]] },
] as const;

const CSS = `
body{margin:0;padding:0 4px;background-color:${C.paper};color:${C.ink};font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif}
.title{margin:6px 0 2px;font-size:26px;font-weight:700}
.sub{margin:0 0 14px;font-size:14px;color:${C.muted}}
.q{margin:16px 0 8px;font-size:16px;font-weight:700}
.r{-webkit-appearance:none;appearance:none;width:0;height:0;margin:0;padding:0;border:0}
.tap{display:inline-block;margin:0 6px 0 0;padding:9px 18px;border-radius:999px;background-color:${C.chip};color:${C.ink};font-size:15px}
.r:checked + .tap{background-color:${C.accent};color:${C.paper};font-weight:700}
.box{width:100%;box-sizing:border-box;padding:10px;border:1px solid ${C.rule};border-radius:12px;font-size:15px;font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif}
.save{margin:8px 0 0;padding:9px 18px;border:1px solid ${C.accent};border-radius:999px;background-color:${C.paper};color:${C.accent};font-size:15px;font-weight:700}
.saved{margin:6px 0 0;font-size:13px;color:${C.accent};font-weight:700}
.failed{margin:6px 0 0;font-size:13px;color:${C.warn};font-weight:700}
`;

const RESULT = `<div submit-success><template type="amp-mustache"><p class="saved">{{saved}} &#10003;</p></template></div>
<div submit-error><template type="amp-mustache"><p class="failed">Not saved, tap again</p></template></div>`;

export function checkinMail(input: { month: string; url: string | null }) {
  const subject = `Monthly check-in · ${input.month}`;
  const text = [
    "MONTHLY CHECK-IN",
    "",
    "Reply with any of these, in your own words:",
    "- Enjoying it? yes / meh / no",
    "- Session length? too short / right / too long",
    "- Anything to change?",
    "",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:0 4px;font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<p style="margin:6px 0 2px;font-size:26px;font-weight:700">Monthly check-in</p>
<p style="font-size:15px;line-height:1.6">Reply with any of these, in your own words:<br>Enjoying it? yes / meh / no<br>Session length? too short / right / too long<br>Anything to change?</p>
</body></html>`;
  if (!input.url) return { subject, text, html };
  const url = esc(input.url);
  const questions = QUESTIONS.map(
    (q) => `<form method="post" action-xhr="${url}"><input type="hidden" name="kind" value="${q.name}">
<p class="q">${esc(q.text)}</p>
${q.options.map(([v, t]) => `<input class="r" type="radio" id="${q.name}-${v}" name="answer" value="${v}" on="change:${q.name}f.submit"><label class="tap" for="${q.name}-${v}">${esc(t)}</label>`).join("")}
${RESULT}
</form>`.replace("<form ", `<form id="${q.name}f" `),
  ).join("\n");
  const amp = `<!doctype html>
<html amp4email data-css-strict>
<head>
<meta charset="utf-8">
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script>
<script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script>
<style amp4email-boilerplate>body{visibility:hidden}</style>
<style amp-custom>${CSS}</style>
</head>
<body>
<p class="title">Monthly check-in</p>
<p class="sub">Three quick taps. Each one saves on its own.</p>
${questions}
<form method="post" action-xhr="${url}"><input type="hidden" name="kind" value="comment">
<p class="q">Anything to change?</p>
<textarea class="box" name="answer" rows="3" maxlength="1000" placeholder="e.g. more glute exercises, shorter sessions"></textarea>
<button class="save" type="submit">Save</button>
${RESULT}
</form>
</body>
</html>`;
  return { subject, text, html, amp };
}
