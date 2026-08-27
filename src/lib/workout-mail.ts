/**
 * Turning a generated plan into an email (design §The workout email).
 *
 * Pure. Transport lives in ./mail-out.ts; everything about what the message
 * looks like is decided here, where it can be tested.
 *
 * The plain-text body is the real output. It is read on a phone with no
 * browser, so it is the plan exactly as generated, with nothing added to
 * scroll past. The HTML is a wrapper around the same words for reading on a
 * computer, and carries no information the text version lacks.
 */

import { DESCRIPTIONS_HEADING, type Slot } from "./prompt";
import { dateOnly } from "./when";

export interface Composed {
  subject: string;
  text: string;
  html: string;
}

/**
 * The subject carries the date, which is what makes the subject-line fallback
 * worth having when a mail client omits In-Reply-To: two workouts a week apart
 * never share one.
 */
export function workoutSubject(slot: Slot): string {
  return `Workout for ${dateOnly(slot.startsAt)}`;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

export function composeWorkoutMail(planText: string, slot: Slot): Composed {
  const text = planText.trim();

  // A plan without the heading is a generation that went wrong, but it is
  // still a workout and it still goes out. Everything becomes the session.
  const at = text.indexOf(DESCRIPTIONS_HEADING);
  const session = (at === -1 ? text : text.slice(0, at)).trim();
  const descriptions =
    at === -1 ? "" : text.slice(at + DESCRIPTIONS_HEADING.length).trim();

  return { subject: workoutSubject(slot), text, html: wrap(session, descriptions) };
}

function wrap(session: string, descriptions: string): string {
  const paragraphs = descriptions
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, " ")}</p>`,
    )
    .join("");

  const explained = descriptions
    ? `<h2 style="font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
                 color:#78716c;margin:32px 0 14px">${escapeHtml(DESCRIPTIONS_HEADING)}</h2>
       ${paragraphs}`
    : "";

  return `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#f5f5f4;padding:28px">
  <div style="max-width:34rem;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:4px;padding:28px;color:#1c1917">
    <pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;
                line-height:1.7;white-space:pre-wrap;margin:0">${escapeHtml(session)}</pre>
    ${explained}
  </div>
</div>`;
}
