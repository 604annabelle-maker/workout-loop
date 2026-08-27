import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Basic auth on the preferences page (design §Security).
 *
 * One person edits one form a handful of times a year, from a computer. A login
 * system would be more code than the thing it protects.
 *
 * Only the page is matched. The webhook and the cron endpoint authenticate
 * themselves, with an HMAC and a shared secret respectively, and must not sit
 * behind a browser prompt.
 */
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    /*
     * Unconfigured is open in development, so the page works on a laptop with
     * an empty .env, and refused outright in production. Same reasoning as the
     * gym app's cron check: never run unguarded where it is reachable.
     */
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("BASIC_AUTH_USER and BASIC_AUTH_PASSWORD are not set", {
        status: 500,
      });
    }
    return NextResponse.next();
  }

  if (matches(request.headers.get("authorization"), user, password)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Workout Loop"' },
  });
}

function matches(header: string | null, user: string, password: string): boolean {
  if (!header) return false;

  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  // Split on the first colon only: a password may contain one.
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;

  return decoded.slice(0, colon) === user && decoded.slice(colon + 1) === password;
}

export const config = { matcher: "/" };
