/**
 * End to end against a real database (plan stage 12): two bookings through
 * the v2 path, taps kept as she goes and picked back up, a swap, a skip, one
 * Save, a reply with shorthand and a comment,
 * then the history the next plan reads. `npm run e2e:v2` with DATABASE_URL
 * pointing at a scratch database and no mailbox (mail prints).
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
    // Taps kept as she goes, picked back up, then one Save: the first card heavier, the second as its swap, the third skipped, the rest as written.
    const [x, y] = plan.exercises;
    console.log(" draft:", (await handleLogV2(id, plan, fd({ kind: "draft", card: "c1", back: "0", c1w: "1", c1r: "9", c1k: "0", c1s: "0" }))).body);
    console.log(" note:", (await handleLogV2(id, plan, fd({ kind: "note", note: "felt strong" }))).body);
    const back = (await handleLogV2(id, plan, fd({ kind: "restore" }))).body as Record<string, unknown>;
    console.log(" picked up:", JSON.stringify(back.c1), JSON.stringify(back.nt));
    const form: Record<string, string> = { kind: "save" };
    plan.exercises.forEach((e, k) => {
      form[`slot_c${k + 1}`] = e.slot;
      form[`r_c${k + 1}`] = String(e.main.reps);
      if (e.main.weight !== null) form[`w_c${k + 1}`] = String(e.main.weight);
    });
    if (x.main.weight !== null) form.w_c1 = String(x.main.steps[Math.min(1, x.main.steps.length - 1)] ?? x.main.weight);
    if (y.swap) {
      form.s_c2 = "1";
      form.r_c2s = "9";
      if (y.swap.weight !== null) form.w_c2s = String(y.swap.weight);
    }
    form.k_c3 = "1";
    form.note = "felt strong";
    console.log(" save:", (await handleLogV2(id, plan, fd(form))).body.saved);
    console.log(" save again, the note not filed twice:", (await handleLogV2(id, plan, fd(form))).body.saved);
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
