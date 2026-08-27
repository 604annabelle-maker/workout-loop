# Workout Loop — design

**Date:** 2026-08-26
**Status:** approved, ready for implementation planning

## Summary

A private, single-user web app. When the owner books an open-gym slot in the Ellé
Fitness app, this app generates a workout from stored preferences and training
history, and emails it. Every exercise comes with a short written description in the
same email. The owner can reply to say how the session went, and that reply feeds the
next workout.

Standalone: its own repo, its own deploy, no code inside the Ellé Fitness codebase
beyond a single outbound webhook call.

## The constraint that drives the design

**The owner's everyday phone cannot access the web.** No browser. Email is the only
channel available at the gym.

This is not a preference, it is a hard constraint, and three things follow:

1. Every interaction must work as an email reply. Tap-to-rate links and "open this
   page" flows are unusable, and so is any link that resolves in a browser.
2. The workout email's **plain-text body is the real output**. The HTML body is a
   wrapper for reading on a computer. Plain text is designed first.
3. Anything needing a browser (setting preferences, browsing history) is a
   computer-only task. Acceptable, because preferences change rarely.

**Confirmed on the actual phone:** image attachments render. **PDF attachments do
not.** So still images are a usable channel, and any idea that routes through a PDF,
including sending the workout as a formatted document, is off the table permanently.

## Goals

- A workout arrives by email shortly after a gym slot is booked, with no action taken.
- Workouts vary sensibly over time: muscle groups rotate, load progresses, and the
  same session is not repeated two days running.
- Every movement in the workout is explained in the same email, so nothing has to be
  looked up.
- Replying in plain English about how a session went changes the next workout.
- **Replying is never required.** A workout with no reply is normal and nothing
  chases it.
- The whole loop runs locally with no API key, no mail credentials, and no remote
  database.
- Running cost stays under one dollar a month.

## Scope

Built in two phases. **Phase one is what this spec plans.** Phase two is written down
so the phase one design does not accidentally block it, not because it is being built
now.

### Phase one

- Booking triggers a generated workout by email.
- Every exercise carries a short written description at the bottom of the email.
- Replies are filed as feedback and feed the next generation. Nothing answers them.

### Phase two, deferred

Deferred because the exercise descriptions cover most of what they were for. Revisit
only if phase one is in use and something is actually missing.

- **Conversational replies.** Ask a question, get an answer. Ask for a change, get a
  revised workout.
- **Image attachments** for demonstrating movements. Confirmed to render on the phone,
  so this is viable whenever it is wanted.

Neither is speculative and both have a known shape. See the notes at the end.

## Non-goals

- Any client-facing or gym-facing feature. This is not a product for Ellé Fitness.
- Multi-user support, accounts, or sharing.
- A mobile app, a native client, or anything requiring a browser on the phone.
- Tracking sets, reps and weights lifted as structured data. Replies are prose.
- Nagging. No "how did that go?" reminder ever goes out.
- Acknowledging a reply that filed correctly. Silence means it worked. Only a reply
  that could not be matched to a workout gets a note back.
- Video demonstrations. Attachments run to megabytes, mail providers strip them, and
  playback on a filtered phone is unlikely.
- PDF attachments of any kind, including a formatted version of the workout. The
  phone cannot open them.
- Anything that resolves in a browser, including video links. Useless on the phone.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Placement | Standalone app | The gym app holds real client and payment data and can never be shown publicly. This one is for a portfolio. |
| Access | Single user, gated on one email address held in an env var | Never fires for anyone else, including a future gym admin |
| Trigger | Signed webhook from the gym app on booking | Event-driven. Fifteen lines on the gym side. |
| Generation timing | After the response, via `after()` | Generation takes about thirty seconds. "Fire and forget" still holds a connection open for all of it, and booking a gym slot must not wait on this. |
| Reply channel | Reply to the workout email | The only channel the phone has |
| Replying | Always optional, never prompted | It is a tool, not a chore |
| Reply handling | Filed as feedback, not answered | Phase one. The exercise descriptions remove most of the reason to ask anything. |
| Explaining movements | A description of every exercise, in the workout email itself | Generated in the same call for a fraction of a cent. Nothing to look up, nothing to ask for, no second system. |
| Receiving mail | Poll a dedicated mailbox over IMAP | No domain, no MX records, no public inbound endpoint, no cost |
| Scheduler | GitHub Actions cron, every 15 minutes | Vercel's free tier restricts cron frequency; Actions on a public repo does not |
| Preferences | Structured fields plus a free-text brief | Structured for what the code depends on, prose for nuance without guessing at fields |
| Model | Claude Opus 5, adaptive thinking | About five cents per workout. Not worth optimizing before it works. |
| Stack | Next.js, Postgres (Neon), Drizzle | Matches what the author already knows from the gym app |

### Rejected alternatives

**Domain plus MX records plus an inbound webhook.** Marginally slicker on a README,
but costs $10–15/year and a DNS change. IMAP polling produces the same closed loop
for nothing. Can be swapped in later without redesigning anything.

**InfinityFree for hosting or mail.** Provides no email service, free subdomains
reportedly cannot take MX or SPF records, and it is PHP/MySQL shared hosting that
cannot run a Node app.

**Video demonstrations, and links to video.** A link resolves in a browser the phone
does not have. Video attachments are too large and usually stripped.

**One-tap feedback links in the email footer.** Was the recommended option until the
phone constraint surfaced. Unusable without a browser.

**Generation driven by the cron rather than the webhook.** GitHub Actions crons have
a five minute floor and in practice run late, sometimes by fifteen minutes. Fine for
a retry net, not for the main delivery path.

## Architecture

```
Ellé Fitness app                    Workout Loop
─────────────────                   ─────────────
bookGymSlot()
  └─ POST /api/booking ──────────▶  verify HMAC
     (fire and forget)               record workout: pending
                                       │
                                       ▼
                                     build prompt (pure)
                                       preferences
                                       last 6 workouts
                                       their feedback
                                       │
                                       ▼
                                     generate (Claude API)
                                       │
                                       ▼
                                     send via SMTP
                                       plain text first, HTML wrapper second
                                       workout, then exercise descriptions
                                       reply-to: the dedicated mailbox
                                       store the Message-ID
                                       │
                        owner replies ◀┘
                        (optional, never prompted)
                                       │
                                       ▼
                    GitHub Actions cron, every 15 minutes
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                  retry pending/unsent      IMAP poll the mailbox
                                              sender must be the owner
                                              match In-Reply-To → workout
                                              strip quoted text
                                              file as feedback, mark seen
                                              └─▶ feeds the next generation
```

## History window

The prompt carries the **last 6 workouts and any feedback filed against them**. At three
sessions a week that is roughly two weeks, which is enough for the model to rotate
muscle groups and progress load without the prompt growing without bound. It is a
constant in `lib/prompt.ts`, not a setting.

## Data model

Three tables.

### `preferences`

A single row, edited from a computer.

| Column | Notes |
|---|---|
| `id` | fixed single row |
| `goals` | text, structured field |
| `experience` | text, structured field |
| `training_days_per_week` | integer |
| `avoid` | text. Injuries, movements to skip. |
| `equipment` | text. What is actually in the gym. Its own field so it cannot be forgotten. |
| `brief` | text. Free-form, in the owner's own words. |
| `updated_at` | timestamp |

Session length is deliberately absent. It comes from the booking.

### `workouts`

One row per booking.

| Column | Notes |
|---|---|
| `id` | |
| `booking_ref` | id from the gym app, unique. Makes the webhook idempotent. |
| `slot_starts_at`, `slot_minutes` | from the booking payload |
| `status` | `pending` → `generated` → `sent`, or `failed` |
| `plan_text` | the plain-text workout |
| `message_id` | `Message-ID` of the email sent. How replies find their way home. |
| `attempts` | integer. One increment per cron attempt, giving up at 3. |
| `last_error` | text, nullable |
| `created_at`, `sent_at` | |

### `feedback`

One row per reply. One direction: replies are filed, not answered.

| Column | Notes |
|---|---|
| `id` | |
| `workout_id` | nullable. An unmatched reply is kept, not dropped. |
| `source_message_id` | unique. Guarantees a reply is never filed twice. |
| `body` | the stripped reply text |
| `received_at` | |

**Phase two migration**, when replies become conversational: add a `direction` column
defaulting to `in`, and start writing `out` rows. One column, no data rewrite. The
phase one shape does not block it.

## Modules

The organizing rule: anything interesting is a pure function, testable with no
database and no network.

| Module | Purpose | Depends on |
|---|---|---|
| `lib/prompt.ts` | **Pure.** Preferences plus the last 6 workouts and their feedback in, prompt string out. The heart of the project. | nothing |
| `lib/reply-parse.ts` | **Pure.** Raw email in, stripped body plus `In-Reply-To` out. | nothing |
| `lib/signature.ts` | **Pure.** HMAC sign and verify for the booking webhook. | node crypto |
| `lib/generate.ts` | Calls the Claude API. Prompt in, plan text out. | Anthropic SDK |

| `lib/mail-out.ts` | Sends over SMTP, returns the `Message-ID`. | nodemailer |
| `lib/mail-in.ts` | Fetches unseen replies over IMAP. | an IMAP client |
| `lib/db.ts` | Schema and queries. | Drizzle |

Each is small enough to read in one sitting and can be changed without touching its
consumers.

## Entry points

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/booking` | Records the booking, answers 202, then generates and sends. Idempotent on `booking_ref`. | HMAC signature header |
| `POST /api/cron` | Retries pending or unsent workouts, then polls for and files replies. | shared secret header |
| `GET /` | The preferences form | HTTP Basic auth |

## Reply matching

In order:

1. **`In-Reply-To` header** matched against `workouts.message_id`. Correct and exact.
2. **Subject-line match**, as a fallback, because not every mail client sets
   `In-Reply-To`. The workout subject carries the slot date, so matching a reply's
   subject with any `Re:` prefixes stripped against the stored subject is close to
   unique. If it matches more than one workout, treat it as unmatched rather than
   guessing.
3. **Unmatched**: store with a null `workout_id` and log it. Never dropped, never
   crashes the poll.

Deduplication is on `messages.source_message_id` being unique, so a message processed
twice inserts once.

## The workout email

Two parts, in this order, because the phone shows the top of a message first.

1. **The workout.** Plain text, scannable, no markdown. Asterisks and pound signs read
   as noise on a text-only client.
2. **The exercises explained.** Below a clear separator, a short description of every
   movement the workout uses. How it is performed, what it should feel like, what to
   avoid.

Both come out of the same generation call. The descriptions cost roughly 400 extra
output tokens, about a cent, and they remove almost every reason to ask a follow-up
question. That is why conversational replies are deferred rather than built.

The plain-text body is the real output. The HTML body is a wrapper around the same
content for reading on a computer.

## Replies

Optional, never prompted, and never answered. A reply is stripped of quoted text and
filed as feedback against its workout, where it feeds the next generation.

Silence means it worked. The only reply that gets a response is one that could not be
matched to a workout, which gets a short note saying so, because otherwise a lost note
would vanish without trace on a phone that cannot check anything.

Replies from anyone but the owner are marked seen and ignored.

## Error handling

| Failure | Behaviour |
|---|---|
| The gym app cannot reach this app | The gym side wraps its POST in try/catch and ignores the result. A booking can never fail because of this feature. |
| Duplicate webhook delivery | `booking_ref` is unique. Second delivery is a no-op. |
| Generation fails | Row stays `pending`, error and attempt count recorded. The cron retries once per run. |
| Three failed attempts | Status `failed`, and a short plain email goes out saying no workout could be generated, so the absence is never silent. |
| Send fails | Row stays `generated`. The cron retries the send without regenerating. |
| IMAP unreachable | The poll logs and exits. The next run picks up the same unseen mail. |
| Reply matches nothing | Stored unmatched, logged. The sender gets a short note saying which workout it could not be tied to, rather than silence. |
| Reply from anyone but the owner | Ignored and marked seen. Never stored, never acted on. |

## Testing

Unit tests with `tsx --test` on `*.test.mts`, following the gym app's convention.

- `prompt.ts` — the right history and feedback appear; an empty history produces a
  valid prompt.
- `reply-parse.ts` — quoted text is stripped across several client formats. This is
  the module most likely to break silently, so it gets the most cases.
- `signature.ts` — a valid signature passes, a tampered body fails.


**Local development with no credentials**, borrowed from the gym app's `lib/email.ts`:
with no SMTP credentials the mailer prints the message to the console instead of
sending; with no `ANTHROPIC_API_KEY` the generator returns a canned plan. The full loop is
exercisable on a laptop with nothing configured.

## Security

The repository is public.

- Every secret in environment variables. Nothing committed.
- The booking webhook verifies an HMAC signature over the body against a shared
  secret. Unsigned or mismatched requests are rejected.
- The cron endpoint requires a shared secret header, following the pattern already
  used at `web/src/app/api/cron/reminders/route.ts` in the gym app, including
  trimming the header value.
- The preferences page is behind HTTP Basic auth, with the username and password in
  environment variables. One user, edited from a computer a handful of times a year,
  so a login system would be more code than the feature it protects. The configured
  owner email is used to decide **who mail goes to**, not to authenticate the page.
- **Only replies from the configured owner address are processed.** Everything else is
  marked seen and ignored. In phase one this only keeps junk out of the table; in phase
  two, when replies drive a model and send mail back, it becomes the guard that stops
  a stranger running up the API bill. Worth having from the start.
- The mailbox is a dedicated account, never a personal one. Gmail over IMAP and SMTP
  requires an App Password, which requires 2FA on that account.

## Cost

| Item | Cost |
|---|---|
| Hosting, Vercel Hobby | Free. Personal non-commercial use qualifies. |
| Database, Neon free tier | Free |
| Mail, one dedicated account, SMTP out and IMAP in | Free. Gmail allows 500 sends/day against a need of roughly 15/month. |
| Scheduler, GitHub Actions on a public repo | Free |
| Domain | Not required |
| Claude API | See below. The only line item that costs anything. |

### API cost in detail

Claude Opus 5 is $5 per million input tokens and $25 per million output tokens.
Thinking tokens bill as output, which is why output dominates.

| Event | Tokens in | Tokens out | Cost |
|---|---|---|---|
| Generate a workout, descriptions included | ~2,000 | ~1,900 | **~6c** |
| File a reply | none | none | **free** |

Filing a reply is a database write. No model is involved in phase one, so how much
the owner writes has no effect on the bill.

At three sessions a week, roughly 13 workouts a month: **about 80 cents a month**,
under ten dollars a year, and flat.

**Prompt caching is deliberately not used.** Output is about 80% of every call, so
caching the stable preferences and instructions would save well under a cent per
workout in exchange for real complexity. Not worth it.

**Levers if it ever matters**, neither applied by default: lowering `effort`, or
Claude Haiku 4.5 at $1/$5 which would cut the bill by roughly five times. Neither is
worth doing before the thing works.

## Change required in the Ellé Fitness repo

Exactly one, and nothing else from this project belongs there.

In `web/src/lib/gym.ts`, in `bookGymSlot`, immediately after the existing
`sendMail(gymBooked({...}))` call: a signed POST to this app's `/api/booking`, in its
own `web/src/lib/workout-loop.ts`, wrapped so any failure is swallowed.

Three properties, in order: a booking can never fail because of it; it fires for one
configured address only, or every client's booking would generate a workout for
somebody else; and it does nothing at all unless configured, so it is inert wherever
it has not been deliberately switched on.

## What makes this worth showing

Written down so the README does not drift into "AI-powered workout generator", which
is the least interesting description of it.

1. **Event-driven.** A real-world action triggers the system. Not a button, not a
   chat box.
2. **It receives email, not just sends it.** Matching a reply to the workout it
   belongs to, stripping quoted text, and never double-processing a message. Almost
   every project sends mail; very few read it.
3. **A closed loop.** Booking triggers generation, generation reads history, the
   reply feeds the next one. It fits on one diagram.

Lead the README with the loop diagram.

## Phase two notes

Not being built. Recorded so phase one does not block them and so the reasoning is not
re-derived from scratch later.

### Conversational replies

Replies that ask a question get an answer; replies that ask for a change get a revised
workout. One handler with the workout, preferences and thread in context, plus tools
for revising and answering. Deliberately not a classifier that sorts replies into
buckets, because a real reply often does two things at once and routing to one bucket
drops the rest.

Migration: add `direction` to `feedback`, start writing `out` rows.

New guards it would need: a cap on replies handled per workout per day, since inbound
mail would then drive a model and send mail back, and a bounce loop could otherwise
ping-pong indefinitely.

Cost: roughly 5c for an answer, 8c for a revision.

### Image attachments

Confirmed to render on the phone. PDFs confirmed not to, so images attach as plain
image files and are never bundled into a document.

Source: [`free-exercise-db`](https://github.com/yuhonas/free-exercise-db), public
domain, over 800 exercises, JSON plus stills, typically two per exercise showing the
start and end of a movement. Vendored into the repo, so no API, no rate limit, no cost,
and no third party that has to stay up.

Matching is fuzzy on the exercise name, and when nothing matches it must say so rather
than silently omit a picture that was asked for.

The written description always goes regardless, which is exactly why this is deferred:
in phase one every exercise is already described in the email.
