import { ampSender } from "@/lib/amp-cors";
import { answerCheckin } from "@/lib/checkin";
import { mailbox } from "@/lib/mailbox";

/**
 * The monthly check-in's taps and comment, from the dynamic email, through
 * Gmail's servers. Same sender check as the workout log.
 */
export async function POST(request: Request) {
  const sender = ampSender(request, mailbox()?.address ?? null);
  if (!sender.ok) return Response.json({ error: "not from the workout address" }, { status: 403, headers: sender.headers });
  const token = new URL(request.url).searchParams.get("t")?.trim() ?? "";
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "not a form" }, { status: 400, headers: sender.headers });
  }
  const saved = token.length >= 16 ? await answerCheckin(token, String(form.get("kind") ?? ""), String(form.get("answer") ?? "")) : null;
  if (!saved) return Response.json({ error: "nothing to save" }, { status: 400, headers: sender.headers });
  return Response.json({ saved }, { headers: sender.headers });
}
