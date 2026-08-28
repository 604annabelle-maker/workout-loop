/**
 * Generates one workout and sends it, or prints it if SMTP is not configured.
 *
 * `npm run send:once`, or `npm run send:once -- 45` for a different slot
 * length. Nothing is written to the database; this exercises the generate,
 * compose and send path only.
 */

process.loadEnvFile(".env");

const { generateWorkout } = await import("../lib/generate.ts");
const { composeWorkoutMail } = await import("../lib/workout-mail.ts");
const { sendMail } = await import("../lib/mail-out.ts");
const { readPreferences, EMPTY } = await import("../lib/preferences.ts");
const { recentWorkouts } = await import("../lib/workouts.ts");

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
  preferences = {
    goals: "get stronger, keep my back healthy",
    experience: "three years, comfortable with barbells",
    trainingDaysPerWeek: 3,
    avoid: "overhead pressing, my left shoulder",
    equipment: "barbell, rack, dumbbells to 30kg, one bench, kettlebells",
    brief: "I would rather do fewer exercises properly than lots of them.",
  };
}

const { planText, canned } = await generateWorkout(
  preferences,
  await recentWorkouts(),
  slot,
);

const mail = composeWorkoutMail(planText, slot);
const result = await sendMail({ to, ...mail });

console.log(`subject:    ${mail.subject}`);
console.log(`plan:       ${canned ? "canned" : "generated"}`);
console.log(`sent:       ${result.sent}${result.reason ? ` (${result.reason})` : ""}`);
console.log(`message id: ${result.messageId}`);

const lines = planText.split("\n");
const over = lines.filter((l) => l.length > 50);
console.log(`longest line: ${Math.max(...lines.map((l) => l.length))} characters`);
console.log(`lines over 50: ${over.length} of ${lines.length}`);
over.slice(0, 5).forEach((l) => console.log(`  ${l.length}: ${l}`));

process.exit(result.sent ? 0 : 1);
