import { parseBookingPayload } from "@/lib/booking-payload";
import { deliverWorkout, recordBooking } from "@/lib/delivery";
import { verify } from "@/lib/signature";

/**
 * The booking webhook, called by the Ellé Fitness app (design §Entry points).
 *
 * Generation and sending happen inline. The gym's call is fire-and-forget, so
 * a slow response here costs a booking nothing, and the alternative would be a
 * queue for one user.
 */

/**
 * Generation with adaptive thinking can run to most of a minute. The cron
 * covers an overrun anyway: the row stays pending and gets picked up, so the
 * worst case is arriving fifteen minutes later rather than not arriving.
 */
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

  const delivery = await deliverWorkout(id);

  return Response.json({ ok: true, workoutId: id, duplicate: false, delivery });
}
