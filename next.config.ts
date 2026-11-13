import type { NextConfig } from "next";

/**
 * The exercise drawings are read off disk by name, not imported, so nothing
 * in the build graph points at them. A Vercel function only ships the files
 * it is traced to use, which would be none of them.
 *
 * The routes that send read the drawings' index to size them in the dynamic
 * email: the webhook, the cron's retries, "send a workout now" and the
 * preview. The picture route serves the drawings themselves.
 */
const PICTURES = ["./assets/exercise-drawings/**", "./assets/exercise-pictures/index.json"];
/** v2 serves the photos for How to. */
const PHOTOS = ["./assets/exercise-pictures/**"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/booking": PICTURES,
    "/api/cron": PICTURES,
    "/api/workout": PICTURES,
    "/api/preview": PICTURES,
    "/pictures/[source]/[file]": [...PICTURES, ...PHOTOS],
  },
};

export default nextConfig;
