// Test data: pnpm db:seed
// An empty database gets 1000 test contacts with notes, in the initial groups.
// A database with contacts gets no new contacts: only the test contacts that
// are in no group are put into groups (seed-groups.ts). Contacts added or
// edited by hand are never touched. The server runs the same (deploy/seed.sh).

import { count, inArray, isNull, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { logDbError } from "../src/db/log-error";
import * as schema from "../src/db/schema";
import { contactGroups, contacts, groups, notes } from "../src/db/schema";
import { getDatabaseUrl, loadEnvFile } from "../src/db/url";
import {
  SEED_CONTACT_COUNT,
  SEED_RANDOM_SEED,
  buildGroupLinks,
  generateContacts,
  seedGroupNames,
} from "./seed-data";
import { addTestContactsToGroups } from "./seed-groups";

const NOTES_BATCH_SIZE = 1000;

async function main() {
  loadEnvFile();
  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(contacts);
    const seedContacts = generateContacts(SEED_CONTACT_COUNT, SEED_RANDOM_SEED);

    if (existing > 0) {
      const put = await addTestContactsToGroups(db, seedContacts);
      console.log(
        put.contacts > 0
          ? `Put ${put.contacts} test contacts into groups (${put.links} group links). Contacts and notes are unchanged.`
          : "No test contacts without groups. Nothing changed.",
      );
      return;
    }

    const added = await db.transaction(async (tx) => {
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

      // Put people into the initial groups; groups that are gone are skipped
      const existingGroups = await tx
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(
          and(
            inArray(groups.name, [...seedGroupNames]),
            isNull(groups.deletedAt),
          ),
        );
      const links = buildGroupLinks(
        seedContacts,
        ids,
        new Map(existingGroups.map((group) => [group.name, group.id])),
      );
      for (let start = 0; start < links.length; start += NOTES_BATCH_SIZE) {
        await tx
          .insert(contactGroups)
          .values(links.slice(start, start + NOTES_BATCH_SIZE));
      }
      return { notes: noteRows.length, links: links.length };
    });

    console.log(
      `Added ${seedContacts.length} contacts, ${added.notes} notes and ${added.links} group links.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  logDbError("Seed failed", error);
  process.exitCode = 1;
});
