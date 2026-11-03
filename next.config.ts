import type { NextConfig } from "next";

/**
 * The exercise pictures are read off disk by name, not imported, so nothing
 * in the build graph points at them. A Vercel function only ships the files
 * it is traced to use, which would be none of them, and every workout would
 * go out without its pictures.
 *
 * The three routes that can send attach them to the plain version: the
 * webhook sends the workout it was triggered by, the cron sends anything
 * that failed the first time, and "send a workout now" sends one for a
 * session that was never booked. The picture route serves them to the
 * dynamic version.
 */
const PICTURES = ["./assets/exercise-pictures/**", "./assets/exercise-drawings/**"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/booking": PICTURES,
    "/api/cron": PICTURES,
    "/api/workout": PICTURES,
    "/api/preview": PICTURES,
    "/pictures/[source]/[file]": PICTURES,
  },
};

export default nextConfig;
