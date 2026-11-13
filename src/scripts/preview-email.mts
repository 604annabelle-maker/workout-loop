/**
 * Sample v2 emails, rendered to files for looking at before anything is sent.
 *
 * `npm run preview:email [out-dir]`. Writes, for a few sessions of a simulated
 * fortnight: the dynamic version, a static rendering of it for a browser
 * (AMP's runtime is not loaded, so every section shows open), the plain HTML
 * and the text. Uses the canned picker, no API key, no database.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { composeAmp } from "../email/amp.ts";
import { compose } from "../email/cards.ts";
import { composeHtml } from "../email/html.ts";
import { photos } from "../email/photos.ts";
import { composeText } from "../email/text.ts";
import { growth } from "../training/deload.ts";
import { simulate } from "../training/fixtures.mts";
import { targets } from "../training/skeleton.ts";
import { weekSummary } from "../training/summary.ts";

const out = process.argv[2] ?? path.join(process.cwd(), "preview");
await mkdir(out, { recursive: true });

const history = await simulate(9, { seed: 7 });
const notes = [{ id: "n1", reason: "wrong_muscle" as const, exerciseId: history[4].plan.exercises[4].main.exerciseId, text: "didn't feel it in my biceps", createdAt: history[7].date, undoneAt: null }];
const { buildSession } = await import("../training/build.ts");
const { DEFAULT_EQUIPMENT } = await import("../training/equipment.ts");
const extra = await buildSession({ history, notes, equipment: DEFAULT_EQUIPMENT, now: new Date(history[8].date.getTime() + 2 * 864e5) });
const sessions = [history[0], history[1], { ...history[8], plan: extra.plan, date: new Date(history[8].date.getTime() + 2 * 864e5) }];

/** The dynamic version as a browser shows it without AMP's runtime: everything visible. */
const staticView = (amp: string) =>
  amp
    .replace(/<script[^>]*><\/script>/g, "")
    .replace(/<style amp4email-boilerplate>[^<]*<\/style>/, "")
    .replace(/<amp-state[\s\S]*?<\/amp-state>/g, "")
    .replace(/<amp-list[\s\S]*?<\/amp-list>/g, '<p class="logged">2 of 7 logged</p>')
    .replace(/<div submit-(success|error)>[\s\S]*?<\/div>/g, "")
    .replace(/<amp-img ([^>]*)><\/amp-img>/g, (_m, a) => `<img ${a.replace(/layout="responsive"/, 'style="width:100%;height:auto"')}>`)
    .replace(/<\/?amp-accordion[^>]*>/g, "")
    .replace(/<style amp-custom>/, '<meta name="viewport" content="width=device-width, initial-scale=1"><style>')
    .replace(/<html amp4email data-css-strict>/, "<html>");

for (const [i, s] of sessions.entries()) {
  const before = history.filter((h) => h.date < s.date);
  const mail = compose({
    plan: s.plan,
    date: s.date,
    summary: weekSummary({ history: before, today: s.plan, weekStart: new Date(s.date.getTime() - 3 * 864e5), targets: targets(growth(before)) }),
    logUrl: "https://workout.example.app/api/log?t=sample-token-0123456789",
    base: "https://workout.example.app",
    photos,
    familiar: new Set(before.flatMap((h) => h.logs.map((l) => l.exerciseId))),
  });
  const name = `${i + 1}-${s.plan.position.type}`;
  const amp = composeAmp(mail);
  await writeFile(path.join(out, `${name}.amp.html`), amp);
  await writeFile(path.join(out, `${name}.view.html`), staticView(amp).replaceAll("https://workout.example.app/pictures/p/", `file://${path.join(process.cwd(), "assets", "exercise-pictures")}/`));
  await writeFile(path.join(out, `${name}.plain.html`), composeHtml(mail));
  await writeFile(path.join(out, `${name}.txt`), composeText(mail));
  console.log(`${name}: ${mail.subject}`);
}
