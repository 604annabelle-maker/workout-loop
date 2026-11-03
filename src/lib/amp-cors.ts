/**
 * The check Gmail makes before it shows what a dynamic email's server said.
 *
 * Pure. When she taps in the email, Gmail calls this app through its own
 * servers and says which address sent the email, in AMP-Email-Sender. It only
 * shows the answer if the answer names that same sender in
 * AMP-Email-Allow-Sender. The older form of the same check, with
 * __amp_source_origin in the address, is answered too, in case a client still
 * uses it. Anything not from her workout address is refused.
 */

export interface Checked {
  ok: boolean;
  /** Headers to send with the answer, refused or not. */
  headers: Record<string, string>;
}

export function ampSender(request: { url: string; headers: Headers }, sender: string | null): Checked {
  const headers: Record<string, string> = {};
  const allowed = sender?.trim().toLowerCase();
  const emailSender = request.headers.get("amp-email-sender")?.trim().toLowerCase();
  const sourceOrigin = new URL(request.url).searchParams.get("__amp_source_origin");

  if (emailSender) {
    if (!allowed || emailSender !== allowed) return { ok: false, headers };
    headers["AMP-Email-Allow-Sender"] = emailSender;
    return { ok: true, headers };
  }

  if (sourceOrigin) {
    if (!allowed || sourceOrigin.toLowerCase() !== allowed) return { ok: false, headers };
    headers["Access-Control-Allow-Origin"] = request.headers.get("origin") ?? "*";
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["AMP-Access-Control-Allow-Source-Origin"] = sourceOrigin;
    headers["Access-Control-Expose-Headers"] = "AMP-Access-Control-Allow-Source-Origin";
    return { ok: true, headers };
  }

  return { ok: false, headers };
}
