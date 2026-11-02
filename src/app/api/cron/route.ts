import { runCron } from "@/lib/cron";
import { checkSecret } from "@/lib/secret";

/**
 * The cron endpoint, called by GitHub Actions (design §Entry points).
 *
 * A batch of retries, the reply poll and reading what the replies say, and
 * on Sunday the weekly review. A retry can mean a full generation, which can
 * run past a minute, so this has the same ceiling as the booking route.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const refused = checkSecret(request);
  if (refused) return refused;

  const report = await runCron();

  return Response.json({ ok: true, ran: new Date().toISOString(), ...report });
}
