# Workout Loop — implementation plan

**Design:** [`../specs/2026-08-26-workout-loop-design.md`](../specs/2026-08-26-workout-loop-design.md)
**Scope:** phase one only.

## Shape of the plan

Nine stages. Each one ends in something that can be checked, not just code that
compiles.

The order is chosen so that **the most interesting logic gets built and tested before
any credential exists**. Stages 1 through 3 need no API key, no mailbox, and no remote
database. By stage 5 the whole loop works end to end, and everything after that is
hardening and connecting.

Credentials are needed at these points and nowhere earlier:

| Stage | Needs |
|---|---|
| 2 | a database (local Postgres is fine) |
| 3 | `ANTHROPIC_API_KEY`, and only to see a real workout rather than the canned one |
| 4 | the dedicated mailbox, SMTP |
| 7 | the same mailbox, IMAP |

---

## Stage 0 — Skeleton

Next.js with TypeScript, Drizzle, Postgres. Match the Ellé Fitness layout closely
enough that moving between the two projects is not jarring: `src/lib`, `src/db`,
`src/app`.

- `package.json` scripts: `dev`, `build`, `typecheck`, `test`, `db:generate`,
  `db:migrate`
- `test` is `tsx --test src/**/*.test.mts`, same convention as the gym app
- `.env.example` listing every variable with a comment. `.env` is gitignored.

**Done when:** `npm run dev` serves a page and `npm run typecheck` is clean.

---

## Stage 1 — The pure core

No database, no network, no framework. Three modules and their tests. This is the part
worth getting right, so it comes first.

### `lib/signature.ts`
HMAC-SHA256 sign and verify over a raw request body. Constant-time comparison.

### `lib/reply-parse.ts`
Raw email in; stripped body and `In-Reply-To` out. Quoted text is the hard part:
`On ... wrote:` blocks, leading `>` lines, and `-----Original Message-----`.

This is the module most likely to break silently, so it gets the most test cases.
Collect real reply samples from at least three clients before trusting it.

### `lib/prompt.ts`
Preferences plus the last 6 workouts and their feedback in, prompt string out. The
history window is a constant here, not a setting.

The prompt must ask for two things in one response: the workout in plain text, and a
short description of every exercise it used. Specify plain text explicitly, since
markdown asterisks read as noise on a text-only mail client.

**Done when:** `npm test` passes with no database and no network configured.

**Watch for:** quoted-text stripping that works on one client and fails on another.
Test cases are cheaper than debugging this later against a live mailbox.

---

## Stage 2 — Schema and preferences

Drizzle schema for `preferences`, `workouts`, `feedback` exactly as the design
specifies, plus the first migration.

The preferences form at `/`, behind HTTP Basic auth with credentials from env. One
row, edited rarely, from a computer. No client-side framework needed.

**Done when:** preferences can be saved, the page reloads showing them, and a wrong
password gets a 401.

---

## Stage 3 — Generation, printing to the console

`lib/generate.ts`. Claude Opus 5, adaptive thinking, streaming (the plan plus
descriptions is a long response and streaming avoids request timeouts).

**With no `ANTHROPIC_API_KEY`, return a canned plan** rather than throwing. This
mirrors the gym app's email fallback and is the reason the whole loop stays runnable
on a laptop with nothing configured.

A small script that generates for a fake booking and prints the result.

**Done when:** the script prints a canned plan with no key set, and with a key set
prints a real workout whose exercises are each described at the bottom.

**Judgement call to make here:** read the output and decide whether the descriptions
are actually useful on a phone, or too long. Tune the prompt now, while it is a
one-line change and nothing downstream depends on the shape.

---

## Stage 4 — Sending

`lib/mail-out.ts`, nodemailer over SMTP, returning the `Message-ID` so replies can
find their way home.

Plain text body built first, HTML wrapper second, workout then separator then
descriptions. **With no SMTP credentials, print the message to the console** instead
of sending.

**Done when:** with no credentials the full message prints; with credentials a real
workout email arrives.

**Check on the phone at this point**, not later: that the plain text is readable, the
workout is above the fold, and nothing renders as markdown noise.

---

## Stage 5 — The webhook. The loop closes.

`POST /api/booking`. Verify the HMAC, insert the workout row (unique on
`booking_ref`, so a duplicate delivery is a no-op), generate, send, record
`message_id` and `sent_at`.

**Done when:** a signed `curl` produces an email, and sending the same payload twice
produces exactly one.

**This is the milestone.** Booking to workout email works end to end. Everything after
this makes it reliable.

---

## Stage 6 — Cron and retries

`POST /api/cron` behind a shared secret header, following the gym app's pattern at
`web/src/app/api/cron/reminders/route.ts` including trimming the header value.

Retries anything `pending` or `generated`, incrementing `attempts`, giving up at 3 and
sending a short plain note so a missing workout is never silent.

GitHub Actions workflow on a 15-minute schedule.

**Done when:** a workout forced to fail generation is picked up and sent on the next
run, and one forced to fail three times produces the note.

---

## Stage 7 — Inbound replies

`lib/mail-in.ts`, IMAP, fetch unseen.

Per message: reject any sender that is not the owner, mark seen, and stop. Otherwise
parse with the stage 1 module, match on `In-Reply-To` against `workouts.message_id`,
fall back to subject matching with `Re:` prefixes stripped, treat an ambiguous subject
match as unmatched rather than guessing. Insert feedback, unique on
`source_message_id`. Unmatched replies are stored with a null `workout_id` and get a
short note back.

**Done when:** replying to a real workout email files a row against the right workout,
replying twice files once, and the next generated workout visibly reflects what the
reply said.

That last check is the one that matters. It is the only proof the loop is closed.

---

## Stage 8 — The gym app

One change in the Ellé Fitness repo and nothing else: in `bookGymSlot`, in
`web/src/lib/gym.ts`, immediately after the existing `sendMail(gymBooked({...}))`
call, a signed POST to `/api/booking`, fire and forget, wrapped so any failure is
swallowed.

**Done when:** a real gym booking produces a real workout email, and the gym app's own
tests still pass.

**Non-negotiable:** a booking must never fail because this feature is down. Verify by
pointing the webhook at a dead URL and confirming a booking still completes normally.

---

## Stage 9 — Deploy and README

Vercel, Neon, environment variables set, Actions secret set.

README leading with the loop diagram, not with the model. What it does, the phone
constraint that shapes it, and how the pieces fit. The constraint is the most
interesting thing about the design and it should be near the top.

**Done when:** a booking made from a phone produces a workout email from production.

---

## Risks

| Risk | Where it bites | Response |
|---|---|---|
| Quoted-text stripping is wrong for the owner's mail client | Stage 7, silently, as garbage feedback | Collect real samples in stage 1; check the first real reply by eye |
| `In-Reply-To` not set by the phone's client | Stage 7 | Subject fallback is already in the design; the first real reply proves which path is used |
| Exercise descriptions make the email too long to read on a phone | Stage 4 | Look at it on the actual phone at stage 4, tune the prompt then |
| Generation inline in the webhook exceeds the function timeout | Stage 5 | Streaming plus the cron retry already covers it. Degrades to arriving 15 minutes later, not to breaking. |
| Neon free tier sleeps and the first query of the day is slow | Stage 5 onward | Harmless. The cron keeps it warm anyway. |

## Not in this plan

Conversational replies and image attachments. Both are written up at the end of the
design document with their shape, guards and costs. Neither is started until phase one
has been in real use.
