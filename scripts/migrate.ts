// Applies database migrations from ./drizzle and exits.
// In production it runs as a one-off container from the new image before
// the new app version starts: if it fails, the new version is not started.
// Locally `pnpm db:migrate` runs it too. OWNER_EMAIL (from .env) is the
// user who gets the contacts and groups that exist before sign-in.

import { logDbError } from "../src/db/log-error";
import { getDatabaseUrl, loadEnvFile } from "../src/db/url";

import { OwnerEmailError, runMigrations } from "./migrate-run";

const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR ?? "./drizzle";

async function main() {
  loadEnvFile();
  const { applied, total } = await runMigrations({
    url: getDatabaseUrl(),
    migrationsFolder: MIGRATIONS_FOLDER,
    ownerEmail: process.env.OWNER_EMAIL,
  });
  console.log(`Migrations: ${applied} applied now, ${total} in total.`);
}

main().catch((error) => {
  if (error instanceof OwnerEmailError) {
    console.error(`Migrations failed: ${error.message}`);
  } else {
    logDbError("Migrations failed", error);
  }
  process.exitCode = 1;
});
