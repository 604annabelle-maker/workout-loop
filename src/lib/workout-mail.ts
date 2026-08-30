/**
 * Turning a generated plan into an email (design §The workout email).
 *
 * Pure. Transport lives in ./mail-out.ts; everything about what the message
 * looks like is decided here, where it can be tested.
 *
 * Both bodies matter. The phone turned out to render HTML, so that is the one
 * actually read, and colour is used there to separate the things being scanned
 * for mid set: which section, which exercise, how many sets.
 *
 * The plain text stays exact and complete rather than becoming a stub. It is
 * the fallback for any client that does not render HTML, and it costs nothing
 * to keep right.
 */

import { DESCRIPTIONS_HEADING, type Slot } from "./prompt";
import { dateOnly } from "./when";
import { shapePlan, type Section } from "./workout-shape";

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

/*
 * Colour by role, not decoration. Every value is set explicitly, including
 * backgrounds, because a mail client left to guess will invert the lot in dark
 * mode and put grey text on grey.
 */
const INK = "#1c1917";
const MUTED = "#78716c";
const FAINT = "#a8a29e";
/** The sets and reps. The one thing being looked for mid set. */
const ACCENT = "#0f766e";
const RULE = "#e7e5e4";
const CARD = "#ffffff";
const PAGE = "#f5f5f4";

function wrap(session: string, descriptions: string): string {
  const shape = shapePlan(
    descriptions ? `${session}\n\n${DESCRIPTIONS_HEADING}\n\n${descriptions}` : session,
  );

  // Nothing recognisable in it, so show it exactly as written rather than
  // rendering an empty shell. Never lose the workout to a parsing miss.
  const body = shape.unparsed
    ? `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.7;
                   white-space:pre-wrap;margin:0;color:${INK}">${escapeHtml(session)}</pre>`
    : shape.sections.map(renderSection).join("");

  const explained =
    shape.descriptions.length > 0
      ? `<div style="border-top:1px solid ${RULE};margin-top:28px;padding-top:20px">
           <p style="font-size:11px;font-weight:700;letter-spacing:.16em;color:${FAINT};margin:0 0 16px">
             ${escapeHtml(DESCRIPTIONS_HEADING)}</p>
           ${shape.descriptions.map(renderDescription).join("")}
         </div>`
      : "";

  return `
<div style="background:${PAGE};padding:16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">
  <div style="max-width:34rem;margin:0 auto;background:${CARD};border:1px solid ${RULE};
              border-radius:8px;padding:20px;color:${INK}">
    ${body}
    ${explained}
  </div>
</div>`;
}

function renderSection(section: Section, index: number): string {
  const heading = section.heading
    ? `<p style="font-size:11px;font-weight:700;letter-spacing:.16em;color:${FAINT};
                 margin:${index === 0 ? "0" : "26px"} 0 12px">${escapeHtml(section.heading)}</p>`
    : "";

  const items = section.items
    .map(
      (item) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.5;color:${MUTED}">${escapeHtml(item)}</p>`,
    )
    .join("");

  const exercises = section.exercises
    .map((exercise) => {
      // Name and sets on one line, because that is the line read between sets.
      const sets = exercise.sets
        ? ` <span style="color:${ACCENT};font-weight:700">${escapeHtml(exercise.sets)}</span>`
        : "";

      const note = exercise.note
        ? `<p style="margin:1px 0 0;font-size:14px;line-height:1.45;color:${MUTED}">${escapeHtml(exercise.note)}</p>`
        : "";

      return `<div style="margin:0 0 14px">
        <p style="margin:0;font-size:17px;line-height:1.35">
          <span style="color:${FAINT}">${escapeHtml(exercise.number)}.</span>
          <span style="font-weight:700">${escapeHtml(exercise.name)}</span>${sets}</p>
        ${note}
      </div>`;
    })
    .join("");

  return heading + items + exercises;
}

function renderDescription(description: { name: string; body: string }): string {
  const name = description.name
    ? `<p style="margin:0 0 3px;font-size:14px;font-weight:700;color:${INK}">${escapeHtml(description.name)}</p>`
    : "";

  return `<div style="margin:0 0 16px">
    ${name}
    <p style="margin:0;font-size:14px;line-height:1.55;color:${MUTED}">${escapeHtml(description.body)}</p>
  </div>`;
}
