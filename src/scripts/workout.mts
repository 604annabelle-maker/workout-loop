/**
 * Running the loop by hand.
 *
 * `npm run workout` after booking a gym slot, or `npm run workout -- 45` for a
 * different length. Does what the deployed app would do on its own:
 *
 *   1. Files any replies waiting in the mailbox, so today's workout is shaped
 *      by what was said about the last one.
 *   2. Records the session and sends the workout.
 *
 * Unlike send:once this writes to the database, which is what makes history
 * accumulate and what lets a reply find the workout it answers. Use this one
 * for real sessions and send:once only for trying things out.
 */

process.loadEnvFile(".env");

const { recordBooking, deliverWorkout } = await import("../lib/delivery.ts");
const { pollReplies } = await import("../lib/replies.ts");
const { recentWorkouts } = await import("../lib/workouts.ts");

const minutes = Number(process.argv[2]) || 60;

const replies = await pollReplies();
if (replies.filed > 0) {
  console.log(`filed ${replies.filed} repl${replies.filed === 1 ? "y" : "ies"} before generating`);
} else if (replies.polled) {
  console.log("no new replies");
} else {
  console.log("mailbox not configured, skipping the reply check");
}

const history = await recentWorkouts();
console.log(`history: ${history.length} past session(s)\n`);

const { id } = await recordBooking({
  bookingRef: `manual-${Date.now()}`,
  slotStartsAt: new Date(),
  slotMinutes: minutes,
});

const result = await deliverWorkout(id);

if (result.status === "sent") {
  console.log(`Sent. ${minutes} minutes. Check your email.`);
} else {
  console.log(`Not sent: ${JSON.stringify(result)}`);
}

process.exit(result.status === "sent" ? 0 : 1);
