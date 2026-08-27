/**
 * Generates one workout for a made-up booking and prints it.
 *
 * `npm run generate:once` for a 60 minute slot an hour from now, or
 * `npm run generate:once -- 45` for a different length.
 *
 * With no ANTHROPIC_API_KEY this prints the canned plan, which is the point:
 * the shape of the output can be checked before the key exists.
 */

process.loadEnvFile(".env");

const { generateWorkout } = await import("../lib/generate.ts");
const { readPreferences, EMPTY } = await import("../lib/preferences.ts");
const { recentWorkouts } = await import("../lib/workouts.ts");
const { DESCRIPTIONS_HEADING } = await import("../lib/prompt.ts");

const minutes = Number(process.argv[2]) || 60;

let preferences = await readPreferences();

if (JSON.stringify(preferences) === JSON.stringify(EMPTY)) {
  console.log("No preferences saved yet, using a sample so there is something to see.\n");
  preferences = {
    goals: "get stronger, keep my back healthy",
    experience: "three years, comfortable with barbells",
    trainingDaysPerWeek: 3,
    avoid: "overhead pressing, my left shoulder",
    equipment: "barbell, rack, dumbbells to 30kg, one bench, kettlebells",
    brief: "I would rather do fewer exercises properly than lots of them.",
  };
}

const history = await recentWorkouts();
const startsAt = new Date(Date.now() + 60 * 60 * 1000);

console.log(`Slot: ${startsAt.toISOString()}, ${minutes} minutes`);
console.log(`History: ${history.length} past session(s)\n`);

const started = Date.now();
const { planText, canned } = await generateWorkout(preferences, history, {
  startsAt,
  minutes,
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log("─".repeat(70));
console.log(planText);
console.log("─".repeat(70));

const [session, descriptions] = planText.split(DESCRIPTIONS_HEADING);

console.log(`\n${canned ? "canned" : "generated"} in ${seconds}s`);
console.log(`characters: ${planText.length} (session ${session.trim().length}, descriptions ${(descriptions ?? "").trim().length})`);
console.log(`splits on "${DESCRIPTIONS_HEADING}": ${descriptions === undefined ? "NO — the mailer would put everything in one half" : "yes"}`);
// Asterisks and pound signs are what a model reaches for when it forgets it is
// writing plain text. Underscores and hyphens occur in ordinary writing.
console.log(`markdown characters in the session: ${(session.match(/[*#`]/g) ?? []).length} (should be 0)`);

process.exit(0);
