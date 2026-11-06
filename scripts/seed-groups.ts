// `pnpm db:seed` on a database that has contacts already: puts the test
// contacts that are in no group into the initial groups, the same way an
// empty database gets them. Contacts added or edited by hand, and anyone
// who is in a group already, are left alone; contacts and notes do not
// change. Takes the database (or a transaction), so tests run it on the
// real test database.

import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";

import { contactGroups, contacts, groups } from "../src/db/schema";
import type { Database } from "../src/db/types";

import { matchTestContacts, seedGroupNames, type SeedContact } from "./seed-data";

const BATCH_SIZE = 1000;

export async function addTestContactsToGroups(
  db: Database,
  seeded: readonly SeedContact[],
): Promise<{ contacts: number; links: number }> {
  return db.transaction(async (tx) => {
    const withoutGroups = await tx
      .select({
        id: contacts.id,
        name: contacts.name,
        about: contacts.about,
        howWeMet: contacts.howWeMet,
        phone: contacts.phone,
        email: contacts.email,
      })
      .from(contacts)
      .where(
        and(
          isNull(contacts.deletedAt),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(contactGroups)
              .where(eq(contactGroups.contactId, contacts.id)),
          ),
        ),
      );

    const initialGroups = await tx
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(
        and(inArray(groups.name, [...seedGroupNames]), isNull(groups.deletedAt)),
      );

    const links = matchTestContacts(
      withoutGroups,
      seeded,
      new Map(initialGroups.map((group) => [group.name, group.id])),
    );
    for (let start = 0; start < links.length; start += BATCH_SIZE) {
      await tx
        .insert(contactGroups)
        .values(links.slice(start, start + BATCH_SIZE))
        .onConflictDoNothing();
    }

    return {
      contacts: new Set(links.map((link) => link.contactId)).size,
      links: links.length,
    };
  });
}
