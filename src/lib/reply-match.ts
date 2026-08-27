/**
 * Deciding which workout a reply answers (design §Reply matching).
 *
 * Pure. Given a parsed reply and the workouts it could plausibly belong to,
 * this returns one or nothing. It never guesses.
 */

import { normalizeSubject, type ParsedReply } from "./reply-parse";

export interface Candidate {
  id: string;
  /** Angle brackets already stripped, as stored. */
  messageId: string | null;
  subject: string | null;
}

export type Match =
  | { how: "in-reply-to"; workoutId: string }
  | { how: "subject"; workoutId: string }
  | { how: "none"; why: string };

export function matchWorkout(reply: ParsedReply, candidates: Candidate[]): Match {
  /*
   * In-Reply-To is the correct answer when it is there. It is exact, it
   * survives a changed subject, and it cannot collide.
   */
  if (reply.inReplyTo) {
    const hit = candidates.find((c) => c.messageId === reply.inReplyTo);
    if (hit) return { how: "in-reply-to", workoutId: hit.id };
  }

  /*
   * The fallback, for clients that omit In-Reply-To. Subjects carry the slot
   * date, so two workouts a week apart never share one, but two slots on the
   * same day would. An ambiguous match is treated as no match: filing feedback
   * against the wrong session is worse than filing it against none, because
   * the wrong one silently steers the next workout.
   */
  const subject = normalizeSubject(reply.subject);

  if (subject) {
    const hits = candidates.filter(
      (c) => c.subject && normalizeSubject(c.subject) === subject,
    );

    if (hits.length === 1) return { how: "subject", workoutId: hits[0].id };
    if (hits.length > 1) {
      return { how: "none", why: `${hits.length} workouts share that subject` };
    }
  }

  return {
    how: "none",
    why: reply.inReplyTo
      ? "no workout has that message id, and the subject matched nothing"
      : "no In-Reply-To header, and the subject matched nothing",
  };
}
