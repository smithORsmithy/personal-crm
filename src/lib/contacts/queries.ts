import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";

// Contacts and notes are always read per request: the data changes
// with every edit and must look the same in every browser.

export async function listContacts() {
  await connection();
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      howWeMet: contacts.howWeMet,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    // Russian ICU collation compares word by word, like a phone book:
    // "Александр Беляев" comes before "Александра Кузнецова"
    .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

// cache() dedupes the query within one request: the page title
// and the page body both need the same contact
export const getContact = cache(async (id: number) => {
  await connection();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact ?? null;
});

export async function listNotes(contactId: number) {
  await connection();
  return db
    .select({ id: notes.id, body: notes.body, createdAt: notes.createdAt })
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}
