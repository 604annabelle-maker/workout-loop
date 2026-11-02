import { ampLogResponse } from "@/lib/amp-test";
import { mailbox } from "@/lib/mailbox";

/**
 * Where the buttons and boxes in the test email post. Gmail calls it, through its own
 * servers, when she taps a button; nothing on her phone opens a link. It
 * answers with what was tapped and stores nothing. Temporary.
 */
export async function POST(request: Request) {
  let fields: { ex: unknown; how: unknown; note: unknown } = { ex: null, how: null, note: null };
  try {
    const form = await request.formData();
    fields = { ex: form.get("ex"), how: form.get("how"), note: form.get("note") };
  } catch {
    // Not form data. Answered as an unknown button below.
  }

  const answer = ampLogResponse(request, fields, mailbox()?.address ?? null);
  console.log("amp-log", answer.status, JSON.stringify(answer.body));

  return Response.json(answer.body, { status: answer.status, headers: answer.headers });
}
