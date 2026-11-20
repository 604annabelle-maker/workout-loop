import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ampSender } from "@/lib/amp-cors";
import { mailbox } from "@/lib/mailbox";
import { hasDraft } from "@/email/draft";
import { handleLogV2, topLine } from "@/lib/v2";
import { logsFor, readPlanV2 } from "@/training/history";

const { workouts } = schema;

/**
 * Logging from the dynamic email (src/email/amp.ts).
 *
 * The one Save, the draft kept as she taps, picking it back up and the undo
 * forms post here, through Gmail's servers, with the workout's secret in the
 * address. GET answers with what is saved so far and whether there is a
 * draft to pick up, for the line under the title. Only
 * Gmail showing an email from her workout address gets an answer it will
 * display.
 */

async function workoutFor(request: Request) {
  const token = new URL(request.url).searchParams.get("t")?.trim();
  if (!token || token.length < 16) return null;
  const [row] = await db
    .select({ id: workouts.id, planV2: workouts.planV2, draft: workouts.draft })
    .from(workouts)
    .where(eq(workouts.logToken, token));
  const plan = row ? readPlanV2(row.planV2) : null;
  return plan ? { id: row.id, plan, draft: hasDraft(row.draft) } : null;
}

function answer(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  const sender = ampSender(request, mailbox()?.address ?? null);
  if (!sender.ok) return answer({ error: "not from the workout address" }, 403, sender.headers);

  const found = await workoutFor(request);
  if (!found) return answer({ error: "no such workout" }, 404, sender.headers);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return answer({ error: "not a form" }, 400, sender.headers);
  }
  const result = await handleLogV2(found.id, found.plan, form);
  return answer(result.body, result.status, sender.headers);
}

export async function GET(request: Request) {
  const sender = ampSender(request, mailbox()?.address ?? null);
  if (!sender.ok) return answer({ error: "not from the workout address" }, 403, sender.headers);

  const found = await workoutFor(request);
  if (!found) return answer({ error: "no such workout" }, 404, sender.headers);

  const summary = topLine(await logsFor(found.id), found.draft);
  return answer({ summary, draft: found.draft }, 200, { ...sender.headers, "cache-control": "no-store" });
}
