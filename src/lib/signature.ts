/**
 * Signing the booking webhook.
 *
 * The Ellé Fitness app and this one share a secret. The gym signs the request
 * body, this verifies it. Nothing else about the request is trusted.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

export function sign(body: string, secret: string): string {
  return PREFIX + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Never throws, and never says yes when it isn't sure.
 *
 * An empty secret means the app is unconfigured, which must fail rather than
 * quietly validate every request against a secret of "".
 *
 * The presented value is trimmed on both sides, the same reasoning as the gym
 * app's cron check: a value pasted into a deployment form can arrive carrying a
 * space or a newline that nothing in the interface shows.
 */
export function verify(
  body: string,
  presented: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !presented) return false;

  const expected = Buffer.from(sign(body, secret), "utf8");
  const given = Buffer.from(presented.trim(), "utf8");

  // timingSafeEqual throws on a length mismatch, so that is checked first. The
  // length of a signature is not a secret.
  if (expected.length !== given.length) return false;

  return timingSafeEqual(expected, given);
}
