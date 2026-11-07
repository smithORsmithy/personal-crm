// Direct access to the e2e database, only to put the starting data in
// place before a test. Everything else the tests do through the browser.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts } from "../src/db/schema";
import { getE2eDatabaseUrls } from "../test/test-url";

type NewContact = typeof contacts.$inferInsert;

// Leaves exactly these contacts in the database: the others go, together
// with their notes and group links (ON DELETE CASCADE). Groups stay.
export async function replaceContacts(list: NewContact[]): Promise<void> {
  const client = postgres(getE2eDatabaseUrls().testUrl, {
    max: 1,
    onnotice: () => {},
  });
  try {
    await drizzle(client).transaction(async (tx) => {
      await tx.delete(contacts);
      if (list.length > 0) {
        await tx.insert(contacts).values(list);
      }
    });
  } finally {
    await client.end();
  }
}
