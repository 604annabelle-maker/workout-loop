# Workout Loop — project brief

A private, single-user app. When I book an open-gym slot in the Ellé Fitness app,
this generates a workout from my preferences and training history and emails it
to me. I reply to that email with how it went, and the reply feeds the next one.

Built as a standalone project, separate from the Ellé Fitness codebase, so it can
go in my portfolio.

## The constraint that drives everything

**My everyday phone cannot access the web.** No browser. Email is the only channel
I have on me at the gym.

Consequences, and they are not optional:

- Feedback has to be an email reply. One-tap links and "open this page" flows are
  useless to me.
- **The workout email must read properly as plain text.** Not just a styled HTML
  body with a text fallback nobody thought about. The plain-text version is the
  one I will actually be reading. Design it first, then wrap it in HTML for when
  I open it on a computer.
- Anything that needs a browser (setting preferences, browsing past workouts) is a
  computer-only task. That is fine, because I set preferences rarely.

## Why standalone

The Ellé Fitness app is a real business system full of client names, prices and
payment records. Nobody can be handed a login, so it is not showable. This one is
public, demoable, and unambiguously mine.

## What makes it worth showing

Not the generator. "AI writes a workout" is the most common shape in every junior
portfolio and reviewers are tired of it. The interesting parts are:

1. **Event-driven.** Something happens in the real world (I book a gym slot) and
   the system reacts. Not a button, not a chat box.
2. **It receives email, not just sends it.** Matching a reply to the workout it
   answers, stripping quoted text, and not double-processing the same message.
3. **A closed loop.** Booking triggers generation, generation reads history, my
   reply feeds the next one. It draws on one diagram.

Lead the README with the loop diagram. Do not lead with "AI-powered".

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Placement | Standalone app, own repo and deploy | Gym app is not showable |
| Access | Single user, gated on one email address in an env var | Never fires for anyone else, including a future gym admin |
| Timing | Generated at booking, emailed within about a minute | Booking must stay instant, so generation is queued rather than awaited |
| Memory | Preferences plus recent workout history | Rotates muscle groups, avoids legs two days running, progresses week to week |
| Feedback | Reply to the workout email | The only channel my phone has |
| Receiving mail | **Poll a dedicated mailbox over IMAP** | No domain, no MX records, no public endpoint, free |
| Scheduler | GitHub Actions cron | Vercel's free tier restricts cron frequency; Actions on a public repo does not |

### Rejected: domain plus MX plus inbound webhook

Slightly slicker on a README, but it costs $10–15/year for a domain and a DNS
change. IMAP polling gets the same closed loop for nothing. Swap it in later if a
domain ever gets bought.

### Rejected: InfinityFree

Does not provide email services, free subdomains reportedly cannot take MX or SPF
records, and it is PHP/MySQL shared hosting that cannot run a Node app anyway.

## Still open

- **How preferences are captured.** Structured form fields, one free-text brief, or
  both. Leaning both: structured for what code needs, prose for nuance.
- **Equipment.** The generator needs to know what is actually in the gym or it will
  prescribe machines that are not there. Probably part of preferences.
- Session length does NOT need to be a preference. It comes from the booking.

## Architecture sketch

```
Ellé Fitness app                    Workout Loop
─────────────────                   ─────────────
bookGymSlot()
  └─ POST /api/booking-webhook ───▶  queue a pending workout
                                       │
                                       ▼
                                     generate (Claude API)
                                       reads: preferences
                                              last N workouts
                                              last N feedback notes
                                       │
                                       ▼
                                     send the workout
                                       plain text first, HTML wrapper second
                                       reply-to: the dedicated mailbox
                                       │
                        I reply ◀──────┘
                          │
                          ▼
              GitHub Actions cron, every few minutes
                          │
                          ▼
                     IMAP poll the mailbox
                       match reply to its workout
                       strip quoted text
                       mark seen so it is not processed twice
                       └─▶ feeds the next generation
```

### The trigger

The gym app POSTs to this app when I book. About fifteen lines on the gym side,
dropped in next to the existing confirmation email in `web/src/lib/gym.ts` (the
`bookGymSlot` function, around line 376, right after `sendMail(gymBooked({...}))`).
Sign the payload with a shared secret and verify it here. Fire and forget, wrapped
so a failure can never break a booking.

### Matching a reply to its workout

Worth thinking about early, since it is the fiddly part. Options: a token in the
subject line, a token in the reply-to address if the mailbox supports plus
addressing, or matching on the `In-Reply-To` header against the `Message-ID` of the
sent mail. `In-Reply-To` is the correct one. Keep a fallback, because not every
mail client sets it.

### Things worth stealing from the Ellé Fitness codebase

- `web/src/lib/email.ts` — Resend wrapper that never throws and prints to the
  console when there is no API key, so every flow can be exercised before any mail
  provider exists. Copy that fallback idea, it is the reason the gym app was
  testable from day one. Copy the shape, not the branding.
- The pure-rules split: `gym-rules.ts` holds pure functions and is unit tested with
  `tsx --test` on `*.test.mts`; `gym.ts` holds everything that touches the database.
  Worth keeping. It makes the interesting logic testable without a database.

## Cost

Free apart from the API calls.

| Item | Cost |
|---|---|
| Hosting (Vercel Hobby) | Free. Personal non-commercial use qualifies. |
| Database (Neon or Supabase free tier) | Free |
| Sending and receiving mail | Free. One dedicated account, SMTP out and IMAP in. Gmail allows 500 sends/day; I need about 15/month. |
| Scheduler (GitHub Actions) | Free on a public repo |
| Domain | **Not needed.** This is what IMAP polling buys. |
| Claude API | **Under $1/month.** No free tier. See below. |

### API cost per workout

Roughly 2,000 tokens in (preferences, history, feedback) and 1,500 out.

- Claude Opus 5, at $5/$25 per million tokens: about **5 cents** per workout.
- Claude Haiku 4.5, at $1/$5 per million: about **1 cent** per workout.

At three gym sessions a week that is about 72 cents a month on Opus 5, or 15 cents
on Haiku. Start on Opus 5. It is not worth optimizing pennies before the thing works.

This is the only thing that costs money and there is no free tier for it.

## Setup notes

- Gmail over IMAP/SMTP needs an **App Password**, which requires 2FA enabled on
  that account. Use a dedicated account, not a personal one.
- Keep the mailbox credentials in env vars, never in the repo. The repo is public.
