/**
 * The plain HTML workout email: any client that does not show the dynamic
 * one, and Gmail once a dynamic email is 30 days old.
 *
 * Pure. The same content as the dynamic version, with no buttons: she logs
 * by replying. No pictures, so it stays light.
 */

import { kg } from "../training/equipment";
import { C, esc } from "./amp";
import { dose, REPLY_HELP, weightText, type Card, type Mail } from "./cards";

const S = {
  body: `margin:0;padding:0 4px;background-color:${C.paper};color:${C.ink};font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif`,
  title: "margin:0;font-size:28px;font-weight:700",
  sub: `margin:2px 0 12px;font-size:14px;color:${C.muted}`,
  sec: `margin:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:1.2px;color:${C.accent}`,
  change: `margin:0 0 8px;padding:8px 10px;background-color:${C.accentSoft};border-radius:10px;font-size:14px`,
  warm: "margin:0;padding:0 0 4px;font-size:15px;line-height:1.5",
  card: `padding:14px 0 12px;border-top:1px solid ${C.rule}`,
  name: "margin:0;font-size:18px;font-weight:700",
  meta: `margin:2px 0 0;font-size:13px;color:${C.muted}`,
  big: "margin:8px 0 0;font-size:18px;font-weight:700",
  small: `margin:4px 0 0;font-size:13px;color:${C.muted}`,
  help: `margin:22px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule};font-size:14px;color:${C.muted};line-height:1.5`,
};

function card(c: Card): string {
  const n = c.main;
  const swap = c.swap ? `<p style="${S.small}">Swap: ${esc(c.swap.name)}, ${esc(dose(c.sets, c.swap.reps))}, ${esc(weightText(c.swap))}</p>` : "";
  return `<div style="${S.card}">
<p style="${S.name}">${esc(n.name)}</p>
<p style="${S.meta}">${esc(`${c.muscle} · rest ${c.rest}`)}</p>
<p style="${S.big}">${esc(dose(c.sets, n.reps))} · ${esc(n.weight === null ? n.weightLabel : `${kg(n.weight)} kg`)}</p>
<p style="${S.small}">${esc(n.weight === null ? c.effort : `${weightText(n)} · ${c.effort}`)}</p>
${n.form ? `<p style="${S.small}">${esc(n.form)}</p>` : ""}
${swap}
</div>`;
}

export function composeHtml(mail: Mail): string {
  const work = mail.cards.filter((c) => !c.finisher);
  const abs = mail.cards.filter((c) => c.finisher);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="${S.body}">
<p style="${S.title}">${esc(mail.title)}</p>
<p style="${S.sub}">${esc(mail.sub)}</p>
${mail.changes.map((ch) => `<div style="${S.change}">${esc(ch.text)}</div>`).join("\n")}
<p style="${S.sec}">WARM-UP · ${mail.warmupMinutes} MIN</p>
${mail.warmup.map((w) => `<p style="${S.warm}">${esc(w.text)}</p>`).join("\n")}
<p style="${S.sec}">WORKOUT</p>
${work.map(card).join("\n")}
${abs.length ? `<p style="${S.sec}">ABS</p>\n${abs.map(card).join("\n")}` : ""}
<div style="${S.help}">${REPLY_HELP.map(esc).join("<br>")}</div>
${mail.summary.length ? `<p style="${S.sec}">THIS WEEK · SETS</p><p style="${S.small}">${mail.summary.map((r) => `${esc(r.label)} ${r.done + r.today}/${r.target}`).join(" · ")}</p>` : ""}
</body></html>`;
}
