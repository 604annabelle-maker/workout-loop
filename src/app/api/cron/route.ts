import { runCron } from "@/lib/cron";

/**
 * The cron endpoint, called by GitHub Actions (design §Entry points).
 *
 * A batch of retries plus, from stage seven, the reply poll. Sixty seconds is
 * generous for both; the batch is capped so a backlog cannot outgrow it.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    /*
     * Trimmed on both sides. A value pasted into a secrets form can arrive
     * carrying a space or a newline that nothing in the interface shows, and
     * an invisible character is a miserable thing to debug.
     */
    const sent = request.headers
      .get("authorization")
      ?.trim()
      .replace(/^Bearer\s+/i, "");

    if (sent !== secret.trim()) {
      return Response.json(
        {
          error: "Not allowed",
          headerPresent: request.headers.has("authorization"),
        },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    // Refuse rather than run unguarded on a public URL.
    return new Response("CRON_SECRET is not set", { status: 500 });
  }

  const report = await runCron();

  return Response.json({ ok: true, ran: new Date().toISOString(), ...report });
}
