/**
 * End to end against a real database (plan stage 12): two bookings through
 * the v2 path, numbers kept as she taps and picked back up, done, a swap, a
 * skip, a note read before the next plan, a reply with shorthand and a comment,
 * then the history the next plan reads. `npm run e2e:v2` with DATABASE_URL
 * pointing at a scratch database and no mailbox (mail prints).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { deliverWorkout, recordBooking } from "../lib/delivery.ts";
import { fileNotes, handleLogV2, readFeedbackV2, loggedLine } from "../lib/v2.ts";
import { loadHistory, loadNotes, logsFor, readPlanV2 } from "../training/history.ts";
import { exercise } from "../training/catalogue.ts";

const { workouts, feedback } = schema;
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const base = Date.now();
const ids: string[] = [];
for (let i = 0; i < 2; i++) {
  const { id } = await recordBooking({ bookingRef: `e2e-${base}-${i}`, slotStartsAt: new Date(base + i * 2 * 864e5), slotMinutes: 60 });
  const d = await deliverWorkout(id);
  console.log("delivery", i, d.status);
  const [row] = await db.select().from(workouts).where(eq(workouts.id, id));
  // The cron/mailer stamps sentAt as now; put it at the slot so the history orders like real life.
  await db.update(workouts).set({ sentAt: row.slotStartsAt }).where(eq(workouts.id, id));
  const plan = readPlanV2(row.planV2)!;
  console.log(" ", plan.position.type, "version", row.version, "status", row.status, "token", !!row.logToken);
  ids.push(id);
  if (i === 0) {
    // Numbers kept as she taps, picked back up, then done or skip per card: the first heavier and done, the second as its swap and done, the third skipped, the rest untouched.
    const [x, y] = plan.exercises;
    const heavier = x.main.weight !== null ? Math.min(1, x.main.steps.length - 1) : 0;
    console.log(" numbers:", (await handleLogV2(id, plan, fd({ kind: "draft", card: "c1", back: "0", c1w: String(heavier), c1r: "9", c1s: "0" }))).body);
    console.log(" note:", (await handleLogV2(id, plan, fd({ kind: "note", note: "felt strong" }))).body);
    const back = (await handleLogV2(id, plan, fd({ kind: "restore" }))).body as Record<string, unknown>;
    console.log(" picked up:", JSON.stringify(back.c1), JSON.stringify(back.nt));
    console.log(" done c1:", (await handleLogV2(id, plan, fd({ kind: "card", card: "c1", c1w: String(heavier), c1r: "9", c1s: "0", c1d: "1", c1k: "0" }))).body.saved);
    if (y.swap) console.log(" done c2 as its swap:", (await handleLogV2(id, plan, fd({ kind: "card", card: "c2", c2w: "0", c2r: String(y.main.reps), c2s: "1", c2sw: "0", c2sr: "9", c2d: "1", c2k: "0" }))).body.saved);
    console.log(" skip c3:", (await handleLogV2(id, plan, fd({ kind: "card", card: "c3", c3w: "0", c3r: "8", c3s: "0", c3d: "0", c3k: "1" }))).body.saved);
    // A late numbers post for c1 that still says the old reps: it changes the numbers, never undoes the done.
    await handleLogV2(id, plan, fd({ kind: "draft", card: "c1", back: "1", c1w: String(heavier), c1r: "10", c1s: "0" }));
    const logs = await logsFor(id);
    console.log(" logged:", loggedLine(plan, logs), logs.map((l) => `${l.slot.split(":")[1]}:${l.weight}x${l.reps[0]}${l.usedSwap ? " swap" : ""}`).join(" "));
    const biceps = plan.exercises.find((e) => e.muscle === "biceps")!;
    const name = exercise(biceps.main.exerciseId)!.name;
    const [fb] = await db.insert(feedback).values({ workoutId: id, sourceMessageId: `e2e-${base}`, body: `${name} 10 10 9 hard\ndidn't feel the ${name.toLowerCase()} in my biceps` }).returning({ id: feedback.id });
    console.log(" reply read:", await readFeedbackV2(fb.id), (await loadNotes()).map((n) => `${n.reason}:${n.exerciseId}`));
  }
}
{
  // The second workout: numbers tapped, nothing marked done, a note typed. Nothing is logged; the note is read before the next plan.
  const [row] = await db.select().from(workouts).where(eq(workouts.id, ids[1]));
  const plan = readPlanV2(row.planV2)!;
  await handleLogV2(ids[1], plan, fd({ kind: "draft", card: "c1", back: "0", c1w: "0", c1r: "9", c1s: "0" }));
  await handleLogV2(ids[1], plan, fd({ kind: "note", note: "my knee felt odd on lunges" }));
  console.log(" nothing marked done, logged:", (await logsFor(ids[1])).length, "| notes read before the next plan:", await fileNotes(new Date(base + 10 * 864e5)), "| again:", await fileNotes(new Date(base + 10 * 864e5)));
}
const h = await loadHistory();
console.log("history", h.length, h.map((s) => `${s.plan.position.type}:${s.logs.length}`));
process.exit(0);
