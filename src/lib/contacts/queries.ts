import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";

import { UNDO_SECONDS } from "./undo-window";

// Contacts and notes are always read per request: the data changes
// with every edit and must look the same in every browser.
// A deleted contact (deleted_at is set) is hidden everywhere at once,
// even during the few seconds it can still be brought back.

export async function listContacts() {
  await connection();
  return getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      howWeMet: contacts.howWeMet,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(isNull(contacts.deletedAt))
    // Russian ICU collation compares word by word, like a phone book:
    // "Александр Беляев" comes before "Александра Кузнецова"
    .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

// cache() dedupes the query within one request: the page title
// and the page body both need the same contact
export const getContact = cache(async (id: number) => {
  await connection();
  const [contact] = await getDb()
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
  return contact ?? null;
});

export async function listNotes(contactId: number) {
  await connection();
  return getDb()
    .select({ id: notes.id, body: notes.body, createdAt: notes.createdAt })
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

// A contact deleted moments ago, for the "удалён / Отменить" message.
// The time left for "Отменить" is counted by the database clock, the same
// clock that stamped deleted_at, so the browser's clock does not matter.
export async function getRecentlyDeletedContact(id: number) {
  await connection();
  const [contact] = await getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      undoMsLeft: sql<number>`greatest(0, extract(epoch from ${contacts.deletedAt} + interval '1 second' * ${UNDO_SECONDS} - now()) * 1000)::int`,
    })
    .from(contacts)
    .where(and(eq(contacts.id, id), isNotNull(contacts.deletedAt)));
  return contact ?? null;
}

export type RecentlyDeletedContact = NonNullable<
  Awaited<ReturnType<typeof getRecentlyDeletedContact>>
>;
