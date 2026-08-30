/**
 * One turn of the cron, by hand.
 *
 * `npm run tick` files any replies and retries anything that failed to send.
 * The same thing GitHub Actions will do every fifteen minutes once deployed.
 */

process.loadEnvFile(".env");

const { runCron } = await import("../lib/cron.ts");

console.log(JSON.stringify(await runCron(), null, 2));
process.exit(0);
