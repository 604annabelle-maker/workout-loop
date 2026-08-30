/**
 * Reading the structure back out of a generated plan.
 *
 * The plan is written as plain text because that is what the phone reads. To
 * colour it in the HTML part, the same text has to be understood rather than
 * printed, so this recovers the shape the prompt asked for: sections, numbered
 * exercises with their sets, and the descriptions underneath.
 *
 * Pure, and forgiving. A model that drifts from the format must not lose
 * anyone their workout, so anything unrecognised is kept as a plain line and
 * a plan that parses to nothing tells the caller to fall back to printing it
 * verbatim.
 */

import { DESCRIPTIONS_HEADING } from "./prompt";

export interface Exercise {
  /** "1", "2". Empty for an unnumbered item. */
  number: string;
  name: string;
  /** "4x5", "3x30 sec each side". Empty when the line carried no sets. */
  sets: string;
  /** The loading and rest line beneath it, if there was one. */
  note: string;
}

export interface Section {
  heading: string;
  /** Plain lines, as used under WARM UP and FINISH. */
  items: string[];
  exercises: Exercise[];
}

export interface Description {
  name: string;
  body: string;
}

export interface Shape {
  sections: Section[];
  descriptions: Description[];
  /** True when nothing recognisable was found and the raw text should be shown. */
  unparsed: boolean;
}

/** "WARM UP", "THE SESSION". Short, all capitals, not a numbered line. */
function isHeading(line: string): boolean {
  const t = line.trim();
  return (
    t.length > 0 &&
    t.length <= 30 &&
    /^[A-Z][A-Z ]*[A-Z]$/.test(t) &&
    t === t.toUpperCase()
  );
}

/** "1. BACK SQUAT  4x5" */
const EXERCISE = /^(\d+)\.\s+(.+?)(?:\s{2,}(\S.*))?$/;

export function shapePlan(planText: string): Shape {
  const at = planText.indexOf(DESCRIPTIONS_HEADING);
  const sessionText = (at === -1 ? planText : planText.slice(0, at)).trim();
  const descriptionsText =
    at === -1 ? "" : planText.slice(at + DESCRIPTIONS_HEADING.length).trim();

  const sections = readSections(sessionText);
  const descriptions = readDescriptions(descriptionsText);

  const nothingFound =
    sections.length === 0 ||
    sections.every((s) => s.items.length === 0 && s.exercises.length === 0);

  return { sections, descriptions, unparsed: nothingFound };
}

function readSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    if (isHeading(line)) {
      current = { heading: line.trim(), items: [], exercises: [] };
      sections.push(current);
      continue;
    }

    // Text before any heading still belongs somewhere.
    if (!current) {
      current = { heading: "", items: [], exercises: [] };
      sections.push(current);
    }

    const indented = /^\s/.test(raw);
    const last = current.exercises.at(-1);

    // An indented line is the note belonging to the exercise above it.
    if (indented && last && !last.note) {
      last.note = line.trim();
      continue;
    }

    const match = line.trim().match(EXERCISE);
    if (match) {
      current.exercises.push({
        number: match[1],
        name: match[2].trim(),
        sets: (match[3] ?? "").trim(),
        note: "",
      });
      continue;
    }

    current.items.push(line.trim().replace(/^-\s*/, ""));
  }

  return sections;
}

function readDescriptions(text: string): Description[] {
  if (!text) return [];

  const out: Description[] = [];

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    const [first, ...rest] = lines;

    /*
     * A block whose first line is a bare name in capitals is a description of
     * that movement. Anything else is prose that belongs to the block before
     * it, which is what a wrapped paragraph looks like after splitting.
     */
    if (isHeading(first) && rest.length > 0) {
      out.push({ name: first.trim(), body: rest.join(" ").trim() });
      continue;
    }

    const previous = out.at(-1);
    if (previous) previous.body += ` ${lines.join(" ").trim()}`;
    else out.push({ name: "", body: lines.join(" ").trim() });
  }

  return out;
}
