/**
 * Small decisions about the dynamic email that need no database: where the
 * app is on the web, and which earlier workouts to ask about.
 *
 * Pure.
 */

import { unlogged, type Session } from "./progress";
import type { Unlogged } from "./workout-mail";

/**
 * Where this app is on the web, for the dynamic email's log buttons and
 * pictures. APP_URL when set, else the production address Vercel provides.
 * Null when neither is known, and then the email goes without a dynamic
 * version: she logs by replying.
 */
export function appUrl(): string | null {
  const raw = process.env.APP_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!raw) return null;
  const url = raw.replace(/\/+$/, "");
  return url.startsWith("http://") ? `https://${url.slice(7)}` : url.startsWith("https://") ? url : `https://${url}`;
}

/** Two workouts in a row with nothing logged, and the email asks about them. */
export const FORGOTTEN_AFTER = 2;

/**
 * The most recent workouts with nothing logged, if there are at least two in
 * a row: a forgotten log otherwise holds every weight where it is, quietly.
 */
export function forgotten(sessions: Session[]): Unlogged[] {
  const newestFirst = [...sessions].sort((a, b) => b.at.getTime() - a.at.getTime());
  const run: Session[] = [];
  const missing = new Set(unlogged(sessions));
  for (const s of newestFirst) {
    if (!missing.has(s)) break;
    run.push(s);
  }
  if (run.length < FORGOTTEN_AFTER) return [];
  return run
    .slice(0, 3)
    .filter((s) => s.logToken && s.plan)
    .map((s) => ({ at: s.at, title: s.plan!.title, token: s.logToken! }));
}

