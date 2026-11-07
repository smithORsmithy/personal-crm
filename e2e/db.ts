// Direct access to the e2e database, only to put the starting data in
// place before a test. Everything else the tests do through the browser.

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contactGroups, contacts, groups, notes } from "../src/db/schema";
import { getE2eDatabaseUrls } from "../test/test-url";

type NewContact = typeof contacts.$inferInsert & {
  // Notes written earlier, with their dates
  notes?: { createdAt: Date; body?: string }[];
  // Names of groups the contact is in (the initial five exist already)
  groups?: string[];
};

async function withDatabase<T>(
  body: (client: postgres.Sql) => Promise<T>,
): Promise<T> {
  const client = postgres(getE2eDatabaseUrls().testUrl, {
    max: 1,
    onnotice: () => {},
  });
  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

// Leaves exactly these contacts in the database: the others go, together
// with their notes and group links (ON DELETE CASCADE). Groups stay.
// Returns the ids of the new contacts, in the same order.
export async function replaceContacts(list: NewContact[]): Promise<number[]> {
  return withDatabase((client) =>
    drizzle(client).transaction(async (tx) => {
      await tx.delete(contacts);
      const ids: number[] = [];
      for (const {
        notes: noteList = [],
        groups: groupNames = [],
        ...contact
      } of list) {
        const [{ id }] = await tx
          .insert(contacts)
          .values(contact)
          .returning({ id: contacts.id });
        ids.push(id);
        for (const note of noteList) {
          await tx.insert(notes).values({
            contactId: id,
            body: note.body ?? "Созвонились, всё хорошо",
            createdAt: note.createdAt,
          });
        }
        if (groupNames.length > 0) {
          const found = await tx
            .select({ id: groups.id })
            .from(groups)
            .where(inArray(groups.name, groupNames));
          await tx
            .insert(contactGroups)
            .values(
              found.map((group) => ({ contactId: id, groupId: group.id })),
            );
        }
      }
      return ids;
    }),
  );
}

// A date by the database clock, "YYYY-MM-DD": today, or some days from it.
// The app picks the year of an own date and its due day by this clock.
export async function databaseDate(daysFromToday = 0): Promise<string> {
  return withDatabase(async (client) => {
    const [{ date }] = await client<{ date: string }[]>`
      select (current_date + ${daysFromToday}::int)::text as date`;
    return date;
  });
}
