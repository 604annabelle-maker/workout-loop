import { db, schema } from "@/db";
import { newLogToken } from "@/lib/delivery";
import { sendMail } from "@/lib/mail-out";
import { checkSecret } from "@/lib/secret";
import { mailFor, planNext } from "@/lib/v2";

const { workouts } = schema;

/**
 * "Preview the workout email", from the Actions tab.
 *
 * Plans the next session exactly as a booking would and sends it, marked as
 * a preview, so a change to the email can be seen on her phone before it
 * matters. The row is kept, with status `preview`, so its Save works; but
 * loadHistory only reads sent workouts, so a preview never counts as
 * training: it does not move the rotation, count in the bars, or set a weight.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const refused = checkSecret(request);
  if (refused) return refused;

  const to = process.env.OWNER_EMAIL?.trim();
  if (!to) return Response.json({ error: "OWNER_EMAIL is not set" }, { status: 500 });

  const now = new Date();
  const built = await planNext({ now });
  const token = newLogToken();
  await db.insert(workouts).values({
    bookingRef: `preview-${now.toISOString()}`,
    slotStartsAt: now,
    slotMinutes: 60,
    status: "preview",
    version: 2,
    planV2: built.plan,
    logToken: token,
  });
  const mail = await mailFor(built.plan, { date: now, token, preview: true });
  const result = await sendMail({ to, ...mail });
  return Response.json({ ok: result.sent, session: built.plan.position.type, modelUsed: built.modelUsed, dynamic: !!mail.amp, ...result });
}
