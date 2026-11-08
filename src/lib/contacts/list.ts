// The contact list of the home page, as a function of the database (or a
// transaction), like due.ts: no "server-only", no Next.js, so tests run it
// on the real test database. The app calls it through queries.ts.

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

// Only the contacts of this user: someone else's are not in the list
export async function selectContactList(db: Database, ownerId: string) {
  return (
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        about: contacts.about,
        howWeMet: contacts.howWeMet,
        phone: contacts.phone,
        email: contacts.email,
        // The ids of the person's groups in the order of the group names;
        // deleted groups are not there, even while they can be undone.
        // "contacts.id" is written out: Drizzle leaves the table name off a
        // column inside a select, and a bare "id" would mean groups.id here.
        groupIds: sql<number[]>`array(
          select cg.group_id from contact_groups cg
          join groups g on g.id = cg.group_id
          where cg.contact_id = contacts.id and g.deleted_at is null
          order by g.name collate "ru-x-icu", g.id
        )`,
      })
      .from(contacts)
      .where(and(eq(contacts.ownerId, ownerId), isNull(contacts.deletedAt)))
      // Russian ICU collation compares word by word, like a phone book:
      // "Александр Беляев" comes before "Александра Кузнецова"
      .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id))
  );
}

export type ContactListItem = Awaited<
  ReturnType<typeof selectContactList>
>[number];
