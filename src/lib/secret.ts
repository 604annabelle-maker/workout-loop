/**
 * The shared secret that guards the endpoints GitHub Actions calls.
 *
 * Returns the response to send when the request is not allowed, or null when
 * it is. Used by the cron and by "send a workout now", which are called from
 * the same place with the same secret.
 */
export function checkSecret(request: Request): Response | null {
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
    return null;
  }

  if (process.env.NODE_ENV === "production") {
    // Refuse rather than run unguarded on a public URL.
    return new Response("CRON_SECRET is not set", { status: 500 });
  }

  return null;
}
