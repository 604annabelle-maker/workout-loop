/**
 * Generates one workout for a made-up booking and prints it.
 *
 * `npm run generate:once` for a 60 minute slot an hour from now, or
 * `npm run generate:once -- 45` for a different length. Nothing is written.
 *
 * With no ANTHROPIC_API_KEY this prints the canned plan, which is the point:
 * the shape of the output can be checked before the key exists.
 */

process.loadEnvFile(".env");

const { generateWorkout } = await import("../lib/generate.ts");
const { buildBrief } = await import("../lib/coach.ts");
const { readPreferences, EMPTY } = await import("../lib/preferences.ts");
const { trainingLog, sessionsSent } = await import("../lib/workouts.ts");
const { composeText } = await import("../lib/workout-mail.ts");
const { snapshot } = await import("../lib/summary.ts");
const { plannedMinutes } = await import("../lib/plan.ts");
const { SAMPLE } = await import("./sample.mts");

const minutes = Number(process.argv[2]) || 60;
const slot = { startsAt: new Date(Date.now() + 60 * 60 * 1000), minutes };

let preferences = await readPreferences();
if (JSON.stringify(preferences) === JSON.stringify(EMPTY)) {
  console.log("No preferences saved yet, using a sample so there is something to see.\n");
  preferences = SAMPLE;
}

const { current } = await import("../lib/coach.ts");
const sessions = current(await trainingLog());
const brief = buildBrief({ preferences, sessions, slot, sessionNumber: (await sessionsSent()) + 1 });

console.log(`Slot: ${slot.startsAt.toISOString()}, ${minutes} minutes`);
console.log(`History: ${sessions.length} session(s) in the log`);
console.log(`Today: ${brief.session.name}, block ${brief.block} week ${brief.week}${brief.deload ? " (lighter)" : ""}`);
console.log(`Targets: ${brief.targets.length}, behind: ${brief.behind.join(", ") || "nothing"}\n`);

const started = Date.now();
const { plan, canned } = await generateWorkout({ preferences, sessions, brief, slot });
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const text = composeText({
  plan,
  brief,
  slot,
  snapshot: snapshot(sessions, brief, slot.startsAt, plan),
});

console.log("─".repeat(70));
console.log(text);
console.log("─".repeat(70));

console.log(`\n${canned ? "canned" : "generated"} in ${seconds}s`);
console.log(`blocks: ${plan.blocks.map((b) => `${b.kind} ${b.minutes}m`).join(", ")}`);
console.log(`planned ${plannedMinutes(plan)} of ${minutes} minutes`);

const lines = text.split("\n");
const over = lines.filter((l: string) => l.length > 50);
console.log(`lines over 50: ${over.length} of ${lines.length}`);
over.slice(0, 5).forEach((l: string) => console.log(`  ${l.length}: ${l}`));

process.exit(0);
