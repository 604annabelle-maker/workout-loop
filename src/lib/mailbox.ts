/**
 * The one account this app sends from and reads.
 *
 * Both directions use the same mailbox on purpose: a reply goes back to
 * whoever sent the workout, so sending and reading have to be the same place
 * for a reply to be findable at all.
 */

export interface Mailbox {
  address: string;
  password: string;
}

/** Null when nothing is configured, which is what puts mail on the console. */
export function mailbox(): Mailbox | null {
  const address = process.env.MAILBOX_ADDRESS?.trim();
  if (!address) return null;

  return { address, password: appPassword(process.env.MAILBOX_PASSWORD ?? "") };
}

/**
 * Google shows an app password as four groups of four, and people paste what
 * they are shown. The spaces are presentation, not part of the secret, and
 * some servers reject the literal string.
 *
 * Only that exact shape is collapsed. A password from anywhere else is left
 * alone, since a space in it might be real.
 */
function appPassword(raw: string): string {
  const trimmed = raw.trim();

  return /^(\w{4} ){3}\w{4}$/.test(trimmed) ? trimmed.replace(/ /g, "") : trimmed;
}
