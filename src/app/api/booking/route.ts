import { after } from "next/server";
import { parseBookingPayload } from "@/lib/booking-payload";
import { deliverWorkout, recordBooking } from "@/lib/delivery";
import { verify } from "@/lib/signature";

/**
 * The booking webhook, called by the Ellé Fitness app (design §Entry points).
 *
 * The booking is recorded, the response goes back immediately, and the workout
 * is generated afterwards.
 *
 * This was originally written to generate inline, on the reasoning that the
 * gym's call is fire and forget so a slow response costs nothing. That was
 * wrong. Generation takes close to thirty seconds, and "fire and forget" still
 * means somebody holds a connection open for all of it. Booking a gym slot
 * must not wait on a personal side project, so the work moves after the
 * response.
 *
 * If the deferred work never runs, because the function is killed or the
 * platform drops it, the row stays pending and the cron picks it up. The net
 * was already there.
 */

/** Generation with adaptive thinking runs to most of a minute. */
export const maxDuration = 60;

const SIGNATURE_HEADER = "x-workout-signature";

export async function POST(request: Request) {
  // Read as text, not JSON. The signature covers these exact bytes, and
  // re-serialising a parsed object would not reproduce them.
  const body = await request.text();
  const secret = process.env.BOOKING_WEBHOOK_SECRET;

  if (secret) {
    if (!verify(body, request.headers.get(SIGNATURE_HEADER), secret)) {
      return Response.json(
        {
          error: "Not allowed",
          // Separates "wrong signature" from "sent none" without describing
          // either. The same reasoning as the gym app's cron check.
          signaturePresent: request.headers.has(SIGNATURE_HEADER),
        },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    // Refuse rather than accept anything from anyone.
    return new Response("BOOKING_WEBHOOK_SECRET is not set", { status: 500 });
  }

  const parsed = parseBookingPayload(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { id, created } = await recordBooking(parsed.booking);

  if (!created) {
    // Delivered twice. The first one is already in hand.
    return Response.json({ ok: true, workoutId: id, duplicate: true });
  }

  // After the response, not before. Failures here are the cron's problem.
  after(async () => {
    try {
      await deliverWorkout(id);
    } catch (err) {
      console.error(`deferred delivery of ${id} failed:`, err);
    }
  });

  return Response.json(
    { ok: true, workoutId: id, duplicate: false, accepted: true },
    { status: 202 },
  );
}
