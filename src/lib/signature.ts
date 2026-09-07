/**
 * Signing the booking webhook.
 *
 * The Ellé Fitness app and this one share a secret. The gym signs the request
 * body, this verifies it. Nothing else about the request is trusted.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

export function sign(body: string, secret: string): string {
  // Trimmed, because this value is pasted into two separate deployment forms
  // and a trailing newline is invisible in both. An untrimmed mismatch looks
  // exactly like a wrong secret and took days to find once already.
  return (
    PREFIX +
    createHmac("sha256", secret.trim()).update(body, "utf8").digest("hex")
  );
}

/**
 * A short, one-way fingerprint of a secret, safe to log.
 *
 * Two deployments holding the same secret print the same eight characters.
 * Comparing them is the only way to tell "the values differ" from "the
 * signing is broken" without either side revealing what it holds.
 */
export function fingerprint(secret: string): string {
  return createHash("sha256").update(secret.trim(), "utf8").digest("hex").slice(0, 8);
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
  if (!secret.trim() || !presented) return false;

  const expected = Buffer.from(sign(body, secret), "utf8");
  const given = Buffer.from(presented.trim(), "utf8");

  // timingSafeEqual throws on a length mismatch, so that is checked first. The
  // length of a signature is not a secret.
  if (expected.length !== given.length) return false;

  return timingSafeEqual(expected, given);
}
