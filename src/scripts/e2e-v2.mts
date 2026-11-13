/**
 * End to end against a real database (plan stage 12): two bookings through
 * the v2 path, taps, a swap, all done, a reply with shorthand and a comment,
 * then the history the next plan reads. `npm run e2e:v2` with DATABASE_URL
 * pointing at a scratch database, PLAN_VERSION=2 and no mailbox (mail prints).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { deliverWorkout, recordBooking } from "../lib/delivery.ts";
import { handleLogV2, readFeedbackV2, loggedLine } from "../lib/v2.ts";
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
    const x = plan.exercises[0];
    console.log(" tap:", (await handleLogV2(id, plan, fd({ kind: "tap", slot: x.slot, swap: "0", w: String((x.main.weight ?? 0) + 2.5), r: "7", tap: "easy" }))).body.saved);
    console.log(" tap again:", (await handleLogV2(id, plan, fd({ kind: "tap", slot: x.slot, swap: "0", w: String(x.main.weight), r: "8", tap: "done" }))).body.saved);
    const y = plan.exercises[1];
    if (y.swap) console.log(" swap tap:", (await handleLogV2(id, plan, fd({ kind: "tap", slot: y.slot, swap: "1", w: String(y.swap.weight ?? ""), r: "9", tap: "hard" }))).body.saved);
    console.log(" all:", (await handleLogV2(id, plan, fd({ kind: "all" }))).body.saved);
    console.log(" logged:", loggedLine(plan, await logsFor(id)), (await logsFor(id)).length);
    const biceps = plan.exercises.find((e) => e.muscle === "biceps")!;
    const name = exercise(biceps.main.exerciseId)!.name;
    const [fb] = await db.insert(feedback).values({ workoutId: id, sourceMessageId: `e2e-${base}`, body: `${name} 10 10 9 hard\ndidn't feel the ${name.toLowerCase()} in my biceps` }).returning({ id: feedback.id });
    console.log(" reply read:", await readFeedbackV2(fb.id), (await loadNotes()).map((n) => `${n.reason}:${n.exerciseId}`));
  }
}
const h = await loadHistory();
console.log("history", h.length, h.map((s) => `${s.plan.position.type}:${s.logs.length}`));
process.exit(0);
