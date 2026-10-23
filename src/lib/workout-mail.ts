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
 *
 * Pictures sit under the exercise they belong to, in the body, referred to by
 * Content-ID. Attaching them instead would put a row of files at the bottom of
 * the message in whatever order they were added, which answers "what does this
 * movement look like" with "scroll down and guess".
 */

import type { Pictured } from "./exercise-pictures";
import type { Lifted } from "./progression";
import { type Slot } from "./prompt";
import { dateOnly } from "./when";
import {
  DESCRIPTIONS_HEADING,
  shapePlan,
  type Exercise,
  type Section,
  type Shape,
} from "./workout-shape";

/** A picture in the body, for the mailer to attach by Content-ID. */
export interface Inline {
  cid: string;
  /** The vendored file name. ./picture-library.ts knows where that is. */
  file: string;
  /** What the mail client calls it, if it ever shows it as a file. */
  filename: string;
}

export interface Composed {
  subject: string;
  text: string;
  html: string;
  /** Only the pictures the HTML actually refers to. */
  inline: Inline[];
}

/** What goes alongside the plan. Both are optional; neither is load-bearing. */
export interface Alongside {
  /** Keyed by exercise name, as ./exercise-pictures.ts produces them. */
  pictures?: Pictured[];
  /** What each of today's movements was last loaded at. */
  lastTime?: Lifted[];
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

export function composeWorkoutMail(
  planText: string,
  slot: Slot,
  alongside: Alongside = {},
): Composed {
  const text = planText.trim();

  // A plan without the heading is a generation that went wrong, but it is
  // still a workout and it still goes out. Everything becomes the session.
  const at = text.indexOf(DESCRIPTIONS_HEADING);
  const session = (at === -1 ? text : text.slice(0, at)).trim();
  const descriptions =
    at === -1 ? "" : text.slice(at + DESCRIPTIONS_HEADING.length).trim();

  const shape = shapePlan(
    descriptions ? `${session}\n\n${DESCRIPTIONS_HEADING}\n\n${descriptions}` : session,
  );

  const pictures = byExercise(alongside.pictures ?? []);
  const lastTime = byExercise(alongside.lastTime ?? []);

  return {
    subject: workoutSubject(slot),
    text,
    html: wrap(shape, session, pictures, lastTime),
    // Taken from the shape rather than from what was offered, so a plan that
    // could not be parsed sends no pictures at all. Half a dozen unreferenced
    // attachments is exactly the bottom-of-the-email pile this avoids.
    inline: shape.unparsed ? [] : inlineFor(shape, pictures),
  };
}

/** Case-insensitive, because the plan shouts and the index does not. */
function byExercise<T extends { exercise: string }>(all: T[]): Map<string, T> {
  return new Map(all.map((one) => [one.exercise.trim().toUpperCase(), one]));
}

function inlineFor(shape: Shape, pictures: Map<string, Pictured>): Inline[] {
  const out: Inline[] = [];

  for (const section of shape.sections) {
    for (const exercise of section.exercises) {
      const found = pictures.get(exercise.name.trim().toUpperCase());
      if (!found) continue;

      for (const [frame, picture] of found.frames.entries()) {
        out.push({
          cid: picture.cid,
          file: picture.file,
          filename: `${exercise.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${frame + 1}.jpg`,
        });
      }
    }
  }

  return out;
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

function wrap(
  shape: Shape,
  session: string,
  pictures: Map<string, Pictured>,
  lastTime: Map<string, Lifted>,
): string {
  // Nothing recognisable in it, so show it exactly as written rather than
  // rendering an empty shell. Never lose the workout to a parsing miss.
  const body = shape.unparsed
    ? `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.7;
                   white-space:pre-wrap;margin:0;color:${INK}">${escapeHtml(session)}</pre>`
    : shape.sections
        .map((section, index) => renderSection(section, index, pictures, lastTime))
        .join("");

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

/**
 * The muscle groups this session works.
 *
 * Rendered as a title rather than a list item because it answers "what is
 * today for", which is the question asked before the workout is even read.
 */
function renderFocus(section: Section): string {
  const focus = [...section.items, ...section.exercises.map((e) => e.name)]
    .filter(Boolean)
    .join(", ");

  if (!focus) return "";

  return `<p style="font-size:11px;font-weight:700;letter-spacing:.16em;color:${FAINT};margin:0 0 4px">
            ${escapeHtml(section.heading)}</p>
          <p style="font-size:20px;font-weight:700;line-height:1.25;color:${ACCENT};margin:0 0 22px">
            ${escapeHtml(focus)}</p>`;
}

function renderSection(
  section: Section,
  index: number,
  pictures: Map<string, Pictured>,
  lastTime: Map<string, Lifted>,
): string {
  if (section.heading === "FOCUS") return renderFocus(section);

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
      const key = exercise.name.trim().toUpperCase();
      return renderExercise(exercise, pictures.get(key), lastTime.get(key));
    })
    .join("");

  return heading + items + exercises;
}

function renderExercise(
  exercise: Exercise,
  pictured: Pictured | undefined,
  lifted: Lifted | undefined,
): string {
  // Name and sets on one line, because that is the line read between sets.
  const sets = exercise.sets
    ? ` <span style="color:${ACCENT};font-weight:700">${escapeHtml(exercise.sets)}</span>`
    : "";

  const note = exercise.note
    ? `<p style="margin:1px 0 0;font-size:14px;line-height:1.45;color:${MUTED}">${escapeHtml(exercise.note)}</p>`
    : "";

  return `<div style="margin:0 0 ${pictured?.frames.length ? "20px" : "14px"}">
    <p style="margin:0;font-size:17px;line-height:1.35">
      <span style="color:${FAINT}">${escapeHtml(exercise.number)}.</span>
      <span style="font-weight:700">${escapeHtml(exercise.name)}</span>${sets}</p>
    ${note}
    ${renderLastTime(lifted)}
    ${renderPictures(exercise.name, pictured)}
  </div>`;
}

/**
 * What this movement was last loaded at.
 *
 * The whole of progressive overload, from where she is standing: today's
 * prescription is above it and last time's is here, so the two can be compared
 * without remembering anything or looking anything up.
 */
function renderLastTime(lifted: Lifted | undefined): string {
  if (!lifted) return "";

  const load = [lifted.sets, lifted.note].filter(Boolean).join(", ");
  if (!load) return "";

  return `<p style="margin:5px 0 0;font-size:13px;line-height:1.45;color:${MUTED}">
    <span style="color:${FAINT}">Last time</span> ${escapeHtml(load)}
    <span style="color:${FAINT}">&middot; ${escapeHtml(dateOnly(lifted.when))}</span></p>`;
}

/** Half the card each, so two frames fit a phone screen without scrolling. */
const PICTURE_WIDTH = 238;

/** Side by side, start of the movement then end, in a table so Outlook obeys. */
function renderPictures(name: string, pictured: Pictured | undefined): string {
  // Nothing was looked up for this exercise, so this is an email without
  // pictures rather than an email missing one. Nothing to say.
  if (!pictured) return "";

  if (pictured.frames.length === 0) {
    /*
     * Said out loud. A movement with no picture in an email that has pictures
     * everywhere else reads as a message that failed to load, and there is no
     * browser on this phone to go and check in.
     */
    return `<p style="margin:5px 0 0;font-size:12px;line-height:1.4;color:${FAINT}">
      No picture for this one.</p>`;
  }

  const frames = pictured.frames;
  const labels = frames.length > 1 ? ["start", "finish"] : [""];

  const cells = frames
    .map((frame, at) => {
      const label = labels[at] ?? `${at + 1}`;
      const alt = label ? `${name}, ${label}` : name;

      return `<td style="width:50%;padding:0 ${at === 0 && frames.length > 1 ? "4px" : "0"} 0 0;vertical-align:top">
        <img src="cid:${frame.cid}" alt="${escapeHtml(alt)}" width="${PICTURE_WIDTH}"
             style="display:block;width:100%;max-width:${PICTURE_WIDTH}px;height:auto;
                    border:1px solid ${RULE};border-radius:6px;background:${PAGE}"></td>`;
    })
    .join("");

  // Named only when the picture is of something adjacent rather than the
  // movement as prescribed, so the caption means something when it appears.
  const shows = pictured.shows
    ? `<p style="margin:4px 0 0;font-size:11px;line-height:1.4;color:${FAINT}">
         Shown: ${escapeHtml(pictured.shows)}</p>`
    : "";

  /*
   * table-layout:fixed, or the cells take their width from the pictures
   * instead of the other way round and the whole email ends up 480px wide on
   * a 375px screen, which is the narrow phone this is written for.
   */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
                 style="margin:8px 0 0;width:100%;max-width:480px;
                        table-layout:fixed;border-collapse:collapse">
            <tr>${cells}</tr>
          </table>${shows}`;
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
