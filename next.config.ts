import type { NextConfig } from "next";

/**
 * The exercise pictures are read off disk by name at send time, not imported,
 * so nothing in the build graph points at them. A Vercel function only ships
 * the files it is traced to use, which would be none of them, and every
 * workout would go out saying there is no picture for any of it.
 *
 * Both routes can send: the webhook sends the workout it was triggered by, and
 * the cron sends anything that failed the first time.
 */
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/booking": ["./assets/exercise-pictures/**"],
    "/api/cron": ["./assets/exercise-pictures/**"],
  },
};

export default nextConfig;
