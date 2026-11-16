/**
 * Where this app is on the web, for the dynamic email's forms and drawings.
 * APP_URL when set, else the production address Vercel provides. Null when
 * neither is known, and then the email goes without a dynamic version: she
 * logs by replying.
 */
export function appUrl(): string | null {
  const raw = process.env.APP_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!raw) return null;
  const url = raw.replace(/\/+$/, "");
  return url.startsWith("http://") ? `https://${url.slice(7)}` : url.startsWith("https://") ? url : `https://${url}`;
}
