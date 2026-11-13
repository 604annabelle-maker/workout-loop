import { db, schema } from "@/db";
import { buildBrief, current, storeBrief } from "@/lib/coach";
import { newLogToken, workoutMail } from "@/lib/delivery";
import { generateWorkout } from "@/lib/generate";
import { sendMail } from "@/lib/mail-out";
import { readPreferences } from "@/lib/preferences";
import { checkSecret } from "@/lib/secret";
import { trainingLog } from "@/lib/workouts";
import { mailFor, planNext, v2On } from "@/lib/v2";

const { workouts } = schema;

/**
 * "Preview the workout email", from the Actions tab.
 *
 * Plans the next session exactly as a booking would and sends it, marked as a
 * preview, so a change to the email can be seen on her phone before it
 * matters. The row is kept, with status `preview`, so its log buttons work;
 * but a preview is never read as training: it does not move the rotation,
 * count in the bars, or set a weight.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const refused = checkSecret(request);
  if (refused) return refused;

  const to = process.env.OWNER_EMAIL?.trim();
  if (!to) return Response.json({ error: "OWNER_EMAIL is not set" }, { status: 500 });

  const now = new Date();
  const slot = { startsAt: now, minutes: 60 };

  // The rebuild's sample: ?version=2, or always once it is switched on. Kept as a preview row so its
  // taps work, but loadHistory only reads sent workouts, so a preview never counts as training.
  const asked = new URL(request.url).searchParams.get("version");
  if (asked === "2" || (asked !== "1" && v2On())) {
    const built = await planNext({ now });
    const token = newLogToken();
    await db.insert(workouts).values({
      bookingRef: `preview-${now.toISOString()}`,
      slotStartsAt: now,
      slotMinutes: slot.minutes,
      status: "preview",
      version: 2,
      planV2: built.plan,
      logToken: token,
    });
    const mail = await mailFor(built.plan, { date: now, token, preview: true });
    const result = await sendMail({ to, ...mail });
    return Response.json({ ok: result.sent, version: 2, session: built.plan.position.type, modelUsed: built.modelUsed, dynamic: !!mail.amp, ...result });
  }
  const preferences = await readPreferences();
  const sessions = current((await trainingLog()).filter((s) => s.at < now));
  const brief = buildBrief({ preferences, sessions, slot, sessionNumber: sessions.length + 1 });
  const { plan, canned } = await generateWorkout({ preferences, sessions, brief, slot });
  const token = newLogToken();

  await db.insert(workouts).values({
    bookingRef: `preview-${now.toISOString()}`,
    slotStartsAt: now,
    slotMinutes: slot.minutes,
    status: "preview",
    plan,
    brief: storeBrief(brief),
    logToken: token,
  });

  const mail = workoutMail({ plan, brief, slot, sessions, token });
  const result = await sendMail({ to, ...mail, subject: `Preview: ${mail.subject}` });

  return Response.json({ ok: result.sent, canned, session: brief.session.name, dynamic: !!mail.amp, ...result });
}
