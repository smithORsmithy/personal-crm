// Reading one contact, its notes and the "удалён / Отменить" notice, as
// functions of the database (or a transaction) and the user. No "server-only"
// and no Next.js, so tests run them on the real test database; the app calls
// them through queries.ts.
// Someone else's contact is answered like one that does not exist.

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { contacts, notes } from "@/db/schema";
import type { Database } from "@/db/types";
import { UNDO_SECONDS } from "@/lib/undo-window";

// A contact of this user that is not deleted: null if there is none
export async function getContact(db: Database, ownerId: string, id: number) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.ownerId, ownerId),
        isNull(contacts.deletedAt),
      ),
    );
  return contact ?? null;
}

// The notes of a contact of this user, the newest first. A note belongs to
// the owner of its contact, so the contact is checked, not the note.
export async function listNotes(
  db: Database,
  ownerId: string,
  contactId: number,
) {
  return db
    .select({ id: notes.id, body: notes.body, createdAt: notes.createdAt })
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(and(eq(notes.contactId, contactId), eq(contacts.ownerId, ownerId)))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

// A contact of this user deleted moments ago, for the "удалён / Отменить"
// message. The time left for "Отменить" is counted by the database clock, the
// same clock that stamped deleted_at, so the browser's clock does not matter.
export async function getRecentlyDeletedContact(
  db: Database,
  ownerId: string,
  id: number,
) {
  const [contact] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      undoMsLeft: sql<number>`greatest(0, extract(epoch from ${contacts.deletedAt} + interval '1 second' * ${UNDO_SECONDS} - now()) * 1000)::int`,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.ownerId, ownerId),
        isNotNull(contacts.deletedAt),
      ),
    );
  return contact ?? null;
}

export type RecentlyDeletedContact = NonNullable<
  Awaited<ReturnType<typeof getRecentlyDeletedContact>>
>;
