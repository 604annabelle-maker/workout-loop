import { manualBooking } from "@/lib/booking-payload";
import { deliverWorkout, recordBooking } from "@/lib/delivery";
import { checkSecret } from "@/lib/secret";

/**
 * "Send a workout now", called by the GitHub Actions button of that name.
 *
 * For a session that was never booked in the gym app: it records a booking
 * for now and delivers it exactly as the webhook would, through the same
 * function, so the workout is in the history and a reply to it is matched
 * like any other. Guarded by the cron's secret, since the same caller holds it.
 *
 * Unlike the webhook this waits for the workout to go out, because the only
 * caller is a button whose log should say whether it worked.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const refused = checkSecret(request);
  if (refused) return refused;

  const parsed = manualBooking(await request.text());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const { id, created } = await recordBooking(parsed.booking);
  const delivery = await deliverWorkout(id);

  return Response.json({
    ok: delivery.status === "sent" || delivery.status === "skipped",
    created,
    minutes: parsed.booking.slotMinutes,
    ...delivery,
  });
}
