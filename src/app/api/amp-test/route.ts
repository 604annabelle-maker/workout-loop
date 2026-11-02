import { ampTestMail } from "@/lib/amp-test";
import { sendMail } from "@/lib/mail-out";
import { checkSecret } from "@/lib/secret";

/**
 * Sends her one sample dynamic email, from the workout address to her own.
 * Called by the "Test dynamic email" button in GitHub Actions, with the cron's
 * secret. Temporary, like the module it calls.
 *
 * The buttons in the email post back to this same deployment, so the address
 * comes from the request: the button calls the app at its public URL.
 */
export async function POST(request: Request) {
  const refused = checkSecret(request);
  if (refused) return refused;

  const to = process.env.OWNER_EMAIL?.trim();
  if (!to) return Response.json({ error: "OWNER_EMAIL is not set" }, { status: 500 });

  const origin = new URL(request.url).origin.replace(/^http:/, "https:");
  const mail = ampTestMail(`${origin}/api/amp-log`);

  const result = await sendMail({ to, ...mail });
  return Response.json({ ok: result.sent, logUrl: `${origin}/api/amp-log`, ...result });
}
