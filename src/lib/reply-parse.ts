/**
 * Reading a reply.
 *
 * Pure on purpose. The IMAP client hands over headers and a text body; every
 * decision about what those mean happens here, where it can be tested against
 * real samples without a mailbox.
 *
 * Getting this wrong is quiet rather than loud: a failure to strip quoted text
 * files the entire previous workout as though it were feedback, and that then
 * feeds the next generation. It is worth more test cases than it looks.
 */

export interface RawMessage {
  /** Header names lowercased. */
  headers: Record<string, string>;
  /** The plain-text body. */
  text: string;
}

export interface ParsedReply {
  /** The reply with quoted text and signatures removed. */
  body: string;
  /** The Message-ID this answers, angle brackets stripped. */
  inReplyTo: string | null;
  /**
   * Every Message-ID in the thread so far, oldest first, brackets stripped.
   *
   * In-Reply-To names only the immediately preceding message, which is not
   * necessarily the workout: one intermediate message in the thread and it
   * points somewhere else entirely. References carries the whole chain, so
   * the workout is still in there.
   */
  references: string[];
  /** The subject with any Re: prefixes removed. */
  subject: string;
  /** The sender's bare address, lowercased. */
  from: string | null;
}

/**
 * Lines that mean everything below is quoted, forwarded, or a signature.
 *
 * `--` on its own is the standard signature delimiter (RFC 3676). A person
 * could conceivably type it themselves, but treating it as a signature is
 * right far more often than it is wrong.
 */
const CUT_MARKERS: RegExp[] = [
  /^\s*>/,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^\s*--\s*$/,
  /^\s*Sent from my\b/i,
  /^\s*Get Outlook for\b/i,
];

/**
 * "On <date>, <someone> wrote:".
 *
 * Gmail wraps this across lines when the name and address are long, so a
 * single-line match is not enough. Up to three lines are joined looking for the
 * closing "wrote:", which is what makes it an attribution rather than a
 * sentence that happens to start with "On".
 */
function isAttribution(lines: string[], i: number): boolean {
  if (!/^\s*On\b/.test(lines[i])) return false;

  let joined = lines[i];
  for (let j = i; j < Math.min(i + 3, lines.length); j++) {
    if (j > i) joined += ` ${lines[j]}`;
    if (/\bwrote:\s*$/.test(joined)) return true;
  }
  return false;
}

/**
 * Outlook quotes by pasting the original headers inline. "From:" alone is too
 * common in ordinary writing to cut on, so it only counts when another header
 * follows it closely.
 */
function isPastedHeaderBlock(lines: string[], i: number): boolean {
  if (!/^\s*From:\s+\S/.test(lines[i])) return false;

  for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
    if (/^\s*(Sent|To|Subject|Date|Cc):\s+/i.test(lines[j])) return true;
  }
  return false;
}

export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (
      CUT_MARKERS.some((re) => re.test(lines[i])) ||
      isAttribution(lines, i) ||
      isPastedHeaderBlock(lines, i)
    ) {
      cut = i;
      break;
    }
  }

  return lines.slice(0, cut).join("\n").trim();
}

/**
 * Strips Re:, Fwd: and friends, however many are stacked up, so a reply's
 * subject can be compared with the one that was sent.
 */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();

  for (;;) {
    const next = s.replace(/^\s*(re|fwd?|aw|sv|antw)\s*(\[\d+\])?\s*:\s*/i, "");
    if (next === s) return s.trim();
    s = next;
  }
}

/**
 * Message-IDs travel wrapped in angle brackets and In-Reply-To may list more
 * than one. Both sides are normalised the same way so a comparison is stable.
 */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const first = raw.trim().split(/\s+/)[0] ?? "";
  const inner = first.replace(/^</, "").replace(/>$/, "").trim();

  return inner.length > 0 ? inner : null;
}

/** Every id in a header that holds a list of them, such as References. */
export function parseMessageIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];

  return raw
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^</, "").replace(/>$/, "").trim())
    .filter((id) => id.length > 0);
}

/** "Someone <a@b.com>" or "a@b.com" to "a@b.com". Null if it isn't an address. */
export function addressOf(header: string | null | undefined): string | null {
  if (!header) return null;

  const angled = header.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : header).trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function parseReply(msg: RawMessage): ParsedReply {
  const header = (name: string) => msg.headers[name] ?? "";

  return {
    body: stripQuoted(msg.text),
    inReplyTo: normalizeMessageId(header("in-reply-to")),
    references: parseMessageIdList(header("references")),
    subject: normalizeSubject(header("subject")),
    from: addressOf(header("from")),
  };
}
