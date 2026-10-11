// Fills an empty database with test contacts: pnpm db:seed
// Does nothing if there are contacts already, so real data is never touched.

import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts, notes } from "../src/db/schema";
import { getDatabaseUrl, loadEnvFile } from "../src/db/url";
import { generateContacts } from "./seed-data";

const CONTACT_COUNT = 1000;
const RANDOM_SEED = 20261011;
const NOTES_BATCH_SIZE = 1000;

async function main() {
  loadEnvFile();
  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(contacts);
    if (existing > 0) {
      console.log(
        `The database already has ${existing} contacts. Seed skipped, nothing changed.`,
      );
      return;
    }

    const seedContacts = generateContacts(CONTACT_COUNT, RANDOM_SEED);

    const noteCount = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(contacts)
        .values(seedContacts.map((item) => item.contact))
        .returning({ id: contacts.id });

      // Identity ids grow in insert order, so sorted ids match the input order
      const ids = inserted.map((row) => row.id).sort((a, b) => a - b);
      const noteRows = seedContacts.flatMap((item, index) =>
        item.notes.map((note) => ({ ...note, contactId: ids[index] })),
      );

      for (let start = 0; start < noteRows.length; start += NOTES_BATCH_SIZE) {
        await tx
          .insert(notes)
          .values(noteRows.slice(start, start + NOTES_BATCH_SIZE));
      }
      return noteRows.length;
    });

    console.log(
      `Added ${seedContacts.length} contacts and ${noteCount} notes.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
