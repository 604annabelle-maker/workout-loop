/**
 * Generates one workout and sends it, or prints it if SMTP is not configured.
 *
 * `npm run send:once`, or `npm run send:once -- 45` for a different slot
 * length. Nothing is written to the database; this exercises the coach,
 * generate, compose and send path only.
 */

process.loadEnvFile(".env");

const { generateWorkout } = await import("../lib/generate.ts");
const { buildBrief } = await import("../lib/coach.ts");
const { composeWorkoutMail } = await import("../lib/workout-mail.ts");
const { workoutPictures } = await import("../lib/picture-library.ts");
const { sendMail } = await import("../lib/mail-out.ts");
const { readPreferences, EMPTY } = await import("../lib/preferences.ts");
const { trainingLog, sessionsSent } = await import("../lib/workouts.ts");
const { snapshot } = await import("../lib/summary.ts");
const { mainExercises } = await import("../lib/plan.ts");
const { SAMPLE } = await import("./sample.mts");

const to = process.env.OWNER_EMAIL;

if (!to) {
  console.error("OWNER_EMAIL is not set in .env. That is where workouts go.");
  process.exit(1);
}

const minutes = Number(process.argv[2]) || 60;
const slot = { startsAt: new Date(Date.now() + 60 * 60 * 1000), minutes };

let preferences = await readPreferences();
if (JSON.stringify(preferences) === JSON.stringify(EMPTY)) {
  console.log("No preferences saved yet, using a sample.\n");
  preferences = SAMPLE;
}

const { current } = await import("../lib/coach.ts");
const sessions = current(await trainingLog());
const brief = buildBrief({ preferences, sessions, slot, sessionNumber: (await sessionsSent()) + 1 });
const { plan, canned } = await generateWorkout({ preferences, sessions, brief, slot });

const pictures = workoutPictures(mainExercises(plan).map((e) => e.name));
const mail = composeWorkoutMail({
  plan,
  brief,
  slot,
  snapshot: snapshot(sessions, brief, slot.startsAt, plan),
  pictures,
});

console.log("─".repeat(60));
console.log(mail.text);
console.log("─".repeat(60) + "\n");

const result = await sendMail({ to, ...mail });
const missing = pictures.filter((p) => p.frames.length === 0).map((p) => p.exercise);

console.log(`subject:    ${mail.subject}`);
console.log(`pictures:   ${mail.inline.length} in the body, for ${pictures.length - missing.length} of ${pictures.length} exercises`);
if (missing.length > 0) console.log(`  no picture: ${missing.join(", ")}`);
console.log(`targets:    ${brief.targets.length} lifts with a number from history`);
console.log(`plan:       ${canned ? "canned" : "generated"}`);
console.log(`sent:       ${result.sent}${result.reason ? ` (${result.reason})` : ""}`);
console.log(`message id: ${result.messageId}`);

const lines = mail.text.split("\n");
const over = lines.filter((l: string) => l.length > 50);
console.log(`lines over 50: ${over.length} of ${lines.length}`);
over.slice(0, 5).forEach((l: string) => console.log(`  ${l.length}: ${l}`));

process.exit(result.sent ? 0 : 1);
