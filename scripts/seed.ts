// Test data: pnpm db:seed
// The data goes to the owner, the user with the email from OWNER_EMAIL (.env
// on the computer, /srv/crm/.env on the server). An owner without contacts
// gets 1000 test contacts with notes, in his initial groups. An owner with
// contacts gets no new contacts: only the test contacts that are in no group
// are put into groups (seed-groups.ts). Contacts added or edited by hand are
// never touched. The server runs the same (deploy/seed.sh).

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { logDbError } from "../src/db/log-error";
import * as schema from "../src/db/schema";
import { getDatabaseUrl, loadEnvFile } from "../src/db/url";

import { seedOwnerData } from "./seed-run";

async function main() {
  loadEnvFile();
  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    console.log(await seedOwnerData(db, process.env.OWNER_EMAIL));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  if (
    error instanceof Error &&
    error.message.startsWith("OWNER_EMAIL is not")
  ) {
    // Only the name of the setting, no data: safe to print
    console.error(`Seed failed: ${error.message}`);
  } else {
    logDbError("Seed failed", error);
  }
  process.exitCode = 1;
});
