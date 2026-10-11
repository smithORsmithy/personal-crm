import { defineConfig } from "drizzle-kit";

import { getDatabaseUrl, loadEnvFile } from "./src/db/url";

loadEnvFile();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: getDatabaseUrl() },
  strict: true,
  verbose: true,
});
