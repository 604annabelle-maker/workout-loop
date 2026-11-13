import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ampSender } from "@/lib/amp-cors";
import { mailbox } from "@/lib/mailbox";
import { mainExercises, readPlan } from "@/lib/plan";
import { applyTap, readTaps, summary } from "@/lib/taps";
import { handleLogV2, loggedLine } from "@/lib/v2";
import { logsFor, readPlanV2 } from "@/training/history";

const { workouts } = schema;

/**
 * Logging by tapping (lib/taps.ts).
 *
 * The forms in the dynamic email post here, through Gmail's servers, with the
 * workout's secret in the address: POST files one tap and answers with what
 * was saved; GET answers with everything logged so far, for the line at the
 * top of the email. Only Gmail showing an email from her workout address gets
 * an answer it will display.
 */

/** A v2 workout, by its token: the rebuild's plan, logged into exercise_log. */
async function v2For(request: Request) {
  const token = new URL(request.url).searchParams.get("t")?.trim();
  if (!token || token.length < 16) return null;
  const [row] = await db
    .select({ id: workouts.id, version: workouts.version, planV2: workouts.planV2 })
    .from(workouts)
    .where(eq(workouts.logToken, token));
  const plan = row?.version === 2 ? readPlanV2(row.planV2) : null;
  return plan ? { id: row.id, plan } : null;
}

async function workoutFor(request: Request) {
  const token = new URL(request.url).searchParams.get("t")?.trim();
  if (!token || token.length < 16) return null;
  const [row] = await db
    .select({ id: workouts.id, plan: workouts.plan, taps: workouts.taps })
    .from(workouts)
    .where(eq(workouts.logToken, token));
  if (!row?.plan) return null;
  try {
    return { id: row.id, plan: readPlan(row.plan), taps: readTaps(row.taps) };
  } catch {
    return null;
  }
}

function answer(body: Record<string, string>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  const sender = ampSender(request, mailbox()?.address ?? null);
  if (!sender.ok) return answer({ error: "not from the workout address" }, 403, sender.headers);

  const v2 = await v2For(request);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return answer({ error: "not a form" }, 400, sender.headers);
  }
  if (v2) {
    const result = await handleLogV2(v2.id, v2.plan, form);
    return answer(result.body, result.status, sender.headers);
  }

  const found = await workoutFor(request);
  if (!found) return answer({ error: "no such workout" }, 404, sender.headers);

  const labels = mainExercises(found.plan).map((e) => e.label);
  const applied = applyTap(
    found.taps,
    {
      ex: String(form.get("ex") ?? ""),
      how: form.get("how") === null ? undefined : String(form.get("how")),
      note: form.get("note") === null ? undefined : String(form.get("note")),
    },
    labels,
    new Date(),
  );
  if (!applied) return answer({ error: "nothing to save" }, 400, sender.headers);

  await db.update(workouts).set({ taps: applied.taps }).where(eq(workouts.id, found.id));

  return answer({ saved: applied.saved, summary: summary(applied.taps, labels) }, 200, sender.headers);
}

export async function GET(request: Request) {
  const sender = ampSender(request, mailbox()?.address ?? null);
  if (!sender.ok) return answer({ error: "not from the workout address" }, 403, sender.headers);

  const v2 = await v2For(request);
  if (v2) return answer({ summary: loggedLine(v2.plan, await logsFor(v2.id)) }, 200, { ...sender.headers, "cache-control": "no-store" });

  const found = await workoutFor(request);
  if (!found) return answer({ error: "no such workout" }, 404, sender.headers);

  const labels = mainExercises(found.plan).map((e) => e.label);
  return answer({ summary: summary(found.taps, labels) }, 200, { ...sender.headers, "cache-control": "no-store" });
}
