# Deploying

Five steps. Everything needs an account you own, so none of it can be scripted
from here.

## 1. Push to GitHub

Create the repository at <https://github.com/new>:

- Name: `workout-loop`
- **Public**, so the Actions cron is free and the repo is showable
- Do **not** tick "Add a README", "Add .gitignore" or a licence. The repository
  already has commits and an initialised repo would collide with them.

Then, from the project folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/workout-loop.git
git push -u origin main
```

Nothing secret is in the repository. `.env` is ignored and every secret is read
from the environment.

## 2. Deploy to Vercel

Go to <https://vercel.com/new> and import the repository.

**Before pressing Deploy**, open the Environment Variables section. Vercel
accepts a whole `.env` file pasted at once: open `.env`, select everything,
paste it in. That sets all nine values in one go and avoids typing a
connection string by hand.

Then deploy. The build takes about a minute.

## 3. Check it came up

Visit the deployment URL. The preferences page should ask for a username and
password, and your saved preferences should be there once you are in. They will
be, because local and production read the same Neon database.

If you get a 500 instead of a password prompt, an environment variable is
missing. Every route refuses to run unconfigured in production rather than
running open, so a 500 here means a missing value, not a broken deploy.

## 4. Give the cron its secrets

In the GitHub repository: **Settings, then Secrets and variables, then
Actions**. Add two repository secrets:

| Name | Value |
|---|---|
| `APP_URL` | The deployment origin, for example `https://workout-loop.vercel.app`. **No trailing slash.** |
| `CRON_SECRET` | The same value as in `.env` |

The workflow runs every fifteen minutes and can be triggered by hand from the
Actions tab. Do that once after setting the secrets: a green tick means the
retry sweep and the mailbox poll are both working in production.

## 5. Connect the gym app

In the **Ellé Fitness** Vercel project, add three variables:

| Name | Value |
|---|---|
| `WORKOUT_LOOP_URL` | `https://your-deployment/api/booking` |
| `WORKOUT_LOOP_SECRET` | The same value as `BOOKING_WEBHOOK_SECRET` in this project's `.env` |
| `WORKOUT_LOOP_EMAIL` | The address on your **Ellé Fitness account**, which is the account whose bookings trigger a workout |

`WORKOUT_LOOP_EMAIL` is not the same setting as `OWNER_EMAIL` here, even if the
address is the same. This one decides *whose booking* counts; `OWNER_EMAIL`
decides *where the workout is sent*.

Then merge the `workout-loop-webhook` branch in the gym repository and let it
redeploy. Until those three variables exist, that code does nothing at all.

## 6. Book a slot

Book an open gym slot on your own account. A workout should arrive within a
minute or so.

If it does not, the booking still succeeded, because that call cannot fail a
booking. Check in this order: the GitHub Actions log, then the Vercel function
logs for `/api/booking`, then whether a row exists in `workouts`.
