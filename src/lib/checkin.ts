/**
 * The monthly check-in: when it goes out, what an answer does (spec §The monthly check-in).
 *
 * Not pure. The cron calls `sendCheckinIfDue` every run; the unique month
 * makes it go out once, on the first Sunday of the month in Jerusalem. "Too
 * long" trims the next sessions' sets; a comment becomes memory notes.
 */

import { desc, eq, isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import { checkinMail } from "../email/checkin";
import { readComment } from "../memory/read";
import { addNotes } from "../training/history";
import { sendMail } from "./mail-out";
import { appUrl } from "./reminders";
import { localParts } from "./when";

const { checkins } = schema;

/** "2026-12", in Jerusalem. */
export const monthOf = (at: Date) => {
  const p = localParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
};

/** The first Sunday of the month, from 8 in the morning, in Jerusalem. */
export function isCheckinDay(at: Date): boolean {
  const p = localParts(at);
  return p.weekday === 0 && p.day <= 7 && p.hour >= 8;
}

/** "Too long" in the latest answer of the last 45 days: about 15% fewer sets. */
export async function budgetFromCheckins(now = new Date()): Promise<number | undefined> {
  try {
    const [row] = await db.select().from(checkins).where(isNotNull(checkins.length)).orderBy(desc(checkins.sentAt)).limit(1);
    if (!row || now.getTime() - row.sentAt.getTime() > 45 * 864e5) return undefined;
    return row.length === "too_long" ? 0.85 : undefined;
  } catch {
    return undefined;
  }
}

export async function sendCheckinIfDue(now = new Date()): Promise<boolean> {
  if (process.env.PLAN_VERSION?.trim() !== "2" || !isCheckinDay(now)) return false;
  const to = process.env.OWNER_EMAIL?.trim();
  if (!to) return false;
  const token = randomBytes(18).toString("base64url");
  const inserted = await db.insert(checkins).values({ month: monthOf(now), token }).onConflictDoNothing().returning({ id: checkins.id });
  if (!inserted.length) return false;
  const base = appUrl();
  const mail = checkinMail({ month: monthOf(now), url: base ? `${base}/api/checkin?t=${encodeURIComponent(token)}` : null });
  const result = await sendMail({ to, ...mail });
  await db.update(checkins).set({ messageId: result.messageId }).where(eq(checkins.id, inserted[0].id));
  return result.sent;
}

export async function answerCheckin(token: string, kind: string, answer: string): Promise<string | null> {
  const [row] = await db.select().from(checkins).where(eq(checkins.token, token));
  if (!row) return null;
  const now = new Date();
  if (kind === "enjoying" && ["yes", "meh", "no"].includes(answer)) {
    await db.update(checkins).set({ enjoying: answer, answeredAt: now }).where(eq(checkins.id, row.id));
    return "Saved";
  }
  if (kind === "length" && ["too_short", "right", "too_long"].includes(answer)) {
    await db.update(checkins).set({ length: answer, answeredAt: now }).where(eq(checkins.id, row.id));
    return answer === "too_long" ? "Saved: sessions get a little shorter" : "Saved";
  }
  if (kind === "comment" && answer.trim()) {
    const text = answer.trim().slice(0, 1000);
    await db.update(checkins).set({ comment: text, answeredAt: now }).where(eq(checkins.id, row.id));
    await addNotes(await readComment(text, []), null);
    return "Saved, thank you";
  }
  return null;
}
