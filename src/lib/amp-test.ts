/**
 * A one-off test of Gmail's dynamic email (AMP for Email) on her phone.
 *
 * Jump links do nothing on her phone, so the plan is a swap that opens when
 * tapped, under its exercise, plus done / easy / hard buttons that save from
 * inside the email. Gmail only shows the dynamic part from a sender she has
 * allowed in its developer settings, and nobody can say in advance whether the
 * Android app honours that, so this sends one sample and nothing else. It
 * stores nothing: a tap is answered with the words it carried, which is enough
 * to prove the round trip.
 *
 * Temporary. It goes once the rebuild has its answer.
 */

/** What the buttons can say. */
export const EFFORTS = ["done", "easy", "hard"] as const;

const EXERCISE = { label: "B1", name: "DUMBBELL ROW", dose: "3 × 8-10 · 22kg" };
const SWAP = { name: "ONE-ARM CABLE ROW", dose: "3 × 8-10" };

export const AMP_TEST_SUBJECT = "Test 4: tap inside the email";

export interface AmpTestMail {
  subject: string;
  text: string;
  html: string;
  amp: string;
}

/** `logUrl` is where the buttons post: this app's /api/amp-log, over https. */
export function ampTestMail(logUrl: string): AmpTestMail {
  return {
    subject: AMP_TEST_SUBJECT,
    text: [
      "PLAIN VERSION: dynamic email did not switch on.",
      "",
      `${EXERCISE.label} ${EXERCISE.name}  ${EXERCISE.dose}`,
      `or: ${SWAP.name}  ${SWAP.dose}`,
    ].join("\n"),
    html: fallbackHtml(),
    amp: ampHtml(logUrl),
  };
}

/**
 * What she sees if the dynamic part is not shown. Says so in its first line,
 * so the answer to the test is in what she reads first.
 */
function fallbackHtml(): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:480px">
<p style="margin:0 0 16px;font-weight:bold;color:#c5221f">PLAIN VERSION: dynamic email did not switch on.</p>
<p style="margin:0 0 4px"><b>${EXERCISE.label}</b> ${EXERCISE.name} &nbsp;${EXERCISE.dose}</p>
<p style="margin:0;font-size:14px;color:#777">or: ${SWAP.name} &nbsp;${SWAP.dose}</p>
</div>`;
}

/*
 * AMP for Email rules this follows: the amp4email attribute, the three
 * required scripts plus one per component, the boilerplate style, one
 * amp-custom style, forms with method="post" and an https action-xhr, and no
 * plain links that start with "#". Some attributes that are fine on web pages
 * are refused in email, disable-session-states on amp-accordion among them:
 * email never keeps that state, so the attribute is an error. Gmail drops a
 * dynamic part that breaks any of these and shows the fallback instead, with
 * INVALID_AMP on the web, which is how the first send failed.
 */
function ampHtml(logUrl: string): string {
  const buttons = EFFORTS.map((how) => effortForm(logUrl, how)).join("\n");

  return `<!doctype html>
<html amp4email data-css-strict>
<head>
<meta charset="utf-8">
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script async custom-element="amp-accordion" src="https://cdn.ampproject.org/v0/amp-accordion-0.1.js"></script>
<script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script>
<script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script>
<style amp4email-boilerplate>body{visibility:hidden}</style>
<style amp-custom>
body{font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222;margin:0;padding:8px}
.yes{margin:0 0 6px;font-weight:bold;color:#0b8043}
.note{margin:0 0 20px;font-size:14px;color:#555555}
.ex{margin:0 0 6px}
.swap{margin:0 0 12px}
.swap h4{margin:0;padding:6px 10px;font-size:14px;font-weight:normal;color:#1a73e8;background-color:#f1f3f4;border:0;border-radius:6px}
.swap .inner{margin:6px 10px 0;font-size:15px}
.log{margin:0 6px 8px 0;display:inline-block;vertical-align:top}
.btn{font-size:15px;font-weight:bold;padding:8px 16px;color:#1a73e8;background-color:#ffffff;border:2px solid #1a73e8;border-radius:6px}
.saved{margin:6px 0 0;font-size:14px;font-weight:bold;color:#0b8043}
.failed{margin:6px 0 0;font-size:14px;color:#c5221f}
</style>
</head>
<body>
<p class="yes">DYNAMIC VERSION: it worked.</p>
<p class="note">Tap "Swap" to open it, then tap one of the buttons. Tell Claude what happened.</p>
<p class="ex"><b>${EXERCISE.label}</b> ${EXERCISE.name} &nbsp;${EXERCISE.dose}</p>
<amp-accordion class="swap">
<section>
<h4>Swap &#9662;</h4>
<div class="inner">or: <b>${SWAP.name}</b> &nbsp;${SWAP.dose}</div>
</section>
</amp-accordion>
${buttons}
</body>
</html>`;
}

/**
 * One form per button. amp-form posts the form's own fields and not which
 * button was pressed, so each button carries its answer in a hidden field.
 */
function effortForm(logUrl: string, how: (typeof EFFORTS)[number]): string {
  return `<form class="log" method="post" action-xhr="${logUrl}">
<input type="hidden" name="ex" value="${EXERCISE.label}">
<input type="hidden" name="how" value="${how}">
<button type="submit" class="btn">${how}</button>
<div submit-success><template type="amp-mustache"><p class="saved">Saved: {{saved}} &#10003;</p></template></div>
<div submit-error><template type="amp-mustache"><p class="failed">Didn't save</p></template></div>
</form>`;
}

/**
 * The answer to a tap, and the headers Gmail needs before it will show it.
 *
 * Gmail sends the email's sender in AMP-Email-Sender and shows the response
 * only if AMP-Email-Allow-Sender names that same sender. The older form of the
 * same check, with __amp_source_origin, is answered too, in case a client
 * still uses it. Anything not from her workout address is refused.
 */
export function ampLogResponse(
  request: { url: string; headers: Headers },
  fields: { ex: unknown; how: unknown },
  sender: string | null,
): { status: number; body: Record<string, string>; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const allowed = sender?.toLowerCase();

  const emailSender = request.headers.get("amp-email-sender")?.trim().toLowerCase();
  const sourceOrigin = new URL(request.url).searchParams.get("__amp_source_origin");

  if (emailSender) {
    if (!allowed || emailSender !== allowed) {
      return { status: 403, body: { error: "not from the workout address" }, headers };
    }
    headers["AMP-Email-Allow-Sender"] = emailSender;
  } else if (sourceOrigin) {
    if (!allowed || sourceOrigin.toLowerCase() !== allowed) {
      return { status: 403, body: { error: "not from the workout address" }, headers };
    }
    headers["Access-Control-Allow-Origin"] = request.headers.get("origin") ?? "*";
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["AMP-Access-Control-Allow-Source-Origin"] = sourceOrigin;
    headers["Access-Control-Expose-Headers"] = "AMP-Access-Control-Allow-Source-Origin";
  } else {
    return { status: 403, body: { error: "not a dynamic email request" }, headers };
  }

  const ex = fields.ex === EXERCISE.label ? EXERCISE.label : null;
  const how = EFFORTS.find((e) => e === fields.how) ?? null;
  if (!ex || !how) return { status: 400, body: { error: "unknown button" }, headers };

  return { status: 200, body: { saved: `${ex} ${how}` }, headers };
}
