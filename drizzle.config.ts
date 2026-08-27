import { defineConfig } from "drizzle-kit";

// Node reads .env for us. drizzle-kit runs outside Next, which would otherwise
// load it.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env yet. Only `generate` runs without one, and it does not need it.
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
