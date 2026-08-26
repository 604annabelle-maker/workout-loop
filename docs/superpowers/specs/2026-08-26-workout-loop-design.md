# Workout Loop — design

**Date:** 2026-08-26
**Status:** approved, ready for implementation planning

## Summary

A private, single-user web app. When the owner books an open-gym slot in the Ellé
Fitness app, this app generates a workout from stored preferences and training
history, and emails it. The owner can reply to that email to say how it went, to
have the workout changed, or to ask a question about a movement. Replies that need an
answer get one by email.

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
- Replying in plain English works for all of: saying how it went, changing the
  workout, and asking how a movement is performed.
- **Replying is never required.** A workout with no reply is normal and nothing
  chases it.
- The whole loop runs locally with no API key, no mail credentials, and no remote
  database.
- Running cost stays under one dollar a month.

## Non-goals

- Any client-facing or gym-facing feature. This is not a product for Ellé Fitness.
- Multi-user support, accounts, or sharing.
- A mobile app, a native client, or anything requiring a browser on the phone.
- Tracking sets, reps and weights lifted as structured data. Replies are prose.
- Nagging. No "how did that go?" reminder ever goes out.
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
| Generation timing | Inline in the webhook request | Delivers in seconds. The gym's call is fire-and-forget, so a slow response there costs nothing. |
| Reply channel | Reply to the workout email | The only channel the phone has |
| Replying | Always optional, never prompted | It is a tool, not a chore |
| Reply handling | One handler with tools, not a classifier | Same amount of code, and it survives "swap the squats, also how do I hip hinge" |
| Demonstrations | Written description always, still images attached when matched | Text is the only thing guaranteed to arrive on the phone |
| Image source | `free-exercise-db`, vendored into the repo | Public domain, 800+ exercises, no API, no rate limit, nothing to stay up |
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

**A classifier that routes replies into buckets** (feedback / tweak / question). No
less code than a handler with tools, and it mishandles a reply that does two things
at once, which is the normal case in real writing.

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
                                       their threads
                                       │
                                       ▼
                                     generate (Claude API)
                                       │
                                       ▼
                                     send via SMTP
                                       plain text first, HTML wrapper second
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
                                              record inbound message
                                                    │
                                                    ▼
                                              reply handler
                                                sees: the workout
                                                      preferences
                                                      the thread so far
                                                tools: revise_workout
                                                       attach_demo
                                                    │
                                        ┌───────────┴───────────┐
                                        ▼                       ▼
                                 answer by email          revise the plan
                                 (+ image attachment)     and resend it
                                        │
                                        └─▶ the thread feeds the next generation
```

## History window

The prompt carries the **last 6 workouts and their message threads**. At three
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

### `messages`

The conversation about a workout, both directions. Replaces what was a one-way
`feedback` table, now that replies are answered rather than only filed.

| Column | Notes |
|---|---|
| `id` | |
| `workout_id` | nullable. An unmatched reply is kept, not dropped. |
| `direction` | `in` or `out` |
| `source_message_id` | unique where present. Guarantees a reply is never processed twice. |
| `body` | the stripped text |
| `created_at` | |

The workout email itself is the first `out` row, so a thread reads in order without
special-casing the original.

## Modules

The organizing rule: anything interesting is a pure function, testable with no
database and no network.

| Module | Purpose | Depends on |
|---|---|---|
| `lib/prompt.ts` | **Pure.** Preferences plus the last 6 workouts and their threads in, prompt string out. The heart of the project. | nothing |
| `lib/reply-parse.ts` | **Pure.** Raw email in, stripped body plus `In-Reply-To` out. | nothing |
| `lib/signature.ts` | **Pure.** HMAC sign and verify for the booking webhook. | node crypto |
| `lib/generate.ts` | Calls the Claude API. Prompt in, plan text out. | Anthropic SDK |
| `lib/reply-handler.ts` | Answers one inbound reply. Sees the workout, preferences and thread; may call `revise_workout` or `attach_demo`. | Anthropic SDK |
| `lib/exercise-images.ts` | **Pure.** Exercise name in, matching image paths out, or nothing. | the vendored dataset |
| `lib/mail-out.ts` | Sends over SMTP, returns the `Message-ID`. | nodemailer |
| `lib/mail-in.ts` | Fetches unseen replies over IMAP. | an IMAP client |
| `lib/db.ts` | Schema and queries. | Drizzle |

Each is small enough to read in one sitting and can be changed without touching its
consumers.

## Entry points

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/booking` | Records the booking, generates, sends. Idempotent on `booking_ref`. | HMAC signature header |
| `POST /api/cron` | Retries pending or unsent workouts, then polls for and answers replies. | shared secret header |
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

## Replies

Replying is optional and never prompted. Most workouts will get no reply and that is
the expected case.

A reply can do any of these, including several at once:

- **Say how it went.** Recorded, feeds the next generation, no answer needed beyond a
  short acknowledgement.
- **Change the workout.** The handler calls `revise_workout`, which replaces
  `plan_text` and sends the revised workout back in full.
- **Ask about a movement.** Answered by email.
- **Ask to see a movement.** See below.

One handler does all of it, with the workout, the preferences and the thread so far in
context, plus two tools. There is deliberately no classifier stage: a real reply often
does two of these at once, and routing to a single bucket would drop the rest.

### Demonstrations

**A written description of the movement always goes.** It is the only thing guaranteed
to arrive on a phone with no browser.

Images are attached to the email when a match is found, using `free-exercise-db`
vendored into the repo: public domain, over 800 exercises, JSON plus stills, typically
two per exercise showing the start and end of the movement. Vendoring means no API
call, no rate limit, no cost, and no third party that has to stay up.

Matching is fuzzy on the exercise name. **When nothing matches, the reply says so** and
sends the description alone. It never silently omits a picture that was asked for.

Image attachments are confirmed to render on the phone, so this channel is real and
not a gamble. PDFs are confirmed not to render, so images are attached as plain image
files and never bundled into a document.

The written description still always goes. It costs nothing, it survives a stripped
attachment, and it is what makes the answer useful when the dataset has no match.

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
| Reply from anyone but the owner | Ignored and marked seen. Never reaches the model, never triggers an outbound email. |
| An exercise has no image in the dataset | The written description goes alone and the reply says no picture was found. |
| A reply loop (auto-responder, bounce) | Capped at 10 handled replies per workout per day. Beyond that, replies are stored but not answered. |
| Reply handling fails | The inbound message is stored and marked seen either way, so the same reply is never answered twice. The failure is logged and not retried. |

## Testing

Unit tests with `tsx --test` on `*.test.mts`, following the gym app's convention.

- `prompt.ts` — the right history and thread messages appear; an empty history
  produces a valid prompt.
- `reply-parse.ts` — quoted text is stripped across several client formats. This is
  the module most likely to break silently, so it gets the most cases.
- `signature.ts` — a valid signature passes, a tampered body fails.
- `exercise-images.ts` — a known exercise resolves to images; an invented one resolves
  to nothing rather than to a wrong match.

**Local development with no credentials**, borrowed from the gym app's `lib/email.ts`:
with no SMTP credentials the mailer prints the message to the console instead of
sending; with no `ANTHROPIC_API_KEY` the generator and the reply handler return canned
output. The full loop, replies included, is exercisable on a laptop with nothing
configured.

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
- **Only replies from the configured owner address are processed.** Inbound mail now
  drives a model and sends mail back, so without this anyone who learns the mailbox
  address could run up the API bill. Everything else is marked seen and ignored.
- **Replies are capped at 10 per workout per day.** An auto-responder or a bounce loop
  would otherwise ping-pong against the mailbox indefinitely.
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
| Exercise images | Free. Public domain dataset vendored into the repo. |
| Claude API | See below. The only line item that costs anything. |

### API cost in detail

Claude Opus 5 is $5 per million input tokens and $25 per million output tokens.
Thinking tokens bill as output, which is why output dominates every figure here.

| Event | Tokens in | Tokens out | Cost |
|---|---|---|---|
| Generate a workout | ~2,000 | ~1,500 | **~5c** |
| Reply that answers a question | ~2,500 + a tool round trip | ~1,200 | **~5c** |
| Reply that revises the workout | ~2,500 + a tool round trip | ~2,000 | **~8c** |

At three sessions a week, roughly 13 workouts a month:

| Month | Cost |
|---|---|
| Quiet, no replies | **~60c** |
| Typical, ~10 reply exchanges | **~$1.20** |
| Heavy, every workout discussed | **~$2.40** |

Call it **one to two and a half dollars a month**, under thirty dollars a year.

**Prompt caching is deliberately not used.** Output is about 80% of every call, so
caching the stable preferences and instructions would save well under a cent per
workout in exchange for real complexity. Not worth it.

**Levers if it ever matters**, neither applied by default: dropping reply handling to
`effort: "medium"` cuts thinking tokens, and Claude Haiku 4.5 at $1/$5 would cut the
whole bill by roughly five times. Neither is worth doing before the thing works.



## Change required in the Ellé Fitness repo

Exactly one, and nothing else from this project belongs there.

In `web/src/lib/gym.ts`, in `bookGymSlot`, immediately after the existing
`sendMail(gymBooked({...}))` call: a signed POST to this app's `/api/booking`, fire
and forget, wrapped so any failure is swallowed. Roughly fifteen lines.

## What makes this worth showing

Written down so the README does not drift into "AI-powered workout generator", which
is the least interesting description of it.

1. **Event-driven.** A real-world action triggers the system. Not a button, not a
   chat box.
2. **It receives email, not just sends it.** Matching a reply to the workout it
   answers, stripping quoted text, never double-processing a message, and answering
   back in the same thread.
3. **A closed loop.** Booking triggers generation, generation reads history, the
   reply feeds the next one. It fits on one diagram.

Lead the README with the loop diagram.
