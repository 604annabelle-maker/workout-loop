/**
 * Plain text layout for a narrow screen.
 *
 * Pure. The plain text body is still read on any client that does not render
 * HTML, and a line that wraps on a narrow screen turns a two line exercise
 * into four and destroys the layout. Lines are wrapped here, by the code,
 * rather than by asking a model to count characters.
 */

/** The widest line the plain text body ever has. */
export const WIDTH = 50;

/**
 * Wraps prose to the width, with an indent on every line after the first and
 * optionally on the first too. Words longer than a line are left whole.
 */
export function wrap(text: string, indent = "", firstIndent = indent, width = WIDTH): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = firstIndent;
  let empty = true;

  for (const word of words) {
    const candidate = empty ? `${line}${word}` : `${line} ${word}`;
    if (!empty && candidate.length > width) {
      lines.push(line);
      line = `${indent}${word}`;
    } else {
      line = candidate;
    }
    empty = false;
  }
  lines.push(line);
  return lines;
}

/** A rule across the width. */
export const RULE = "─".repeat(WIDTH);

/** "150" to "2:30", "60" to "60 sec". How a rest reads at a glance. */
export function restText(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 90) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
}
