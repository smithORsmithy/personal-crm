import "server-only";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";

import * as due from "./due";
import { selectContactList } from "./list";
import { UNDO_SECONDS } from "@/lib/undo-window";

// Contacts and notes are always read per request: the data changes
// with every edit and must look the same in every browser.
// A deleted contact (deleted_at is set) is hidden everywhere at once,
// even during the few seconds it can still be brought back.

// The list itself lives in list.ts, here it runs on the app's database
export async function listContacts() {
  await connection();
  return selectContactList(getDb());
}

export type { ContactListItem } from "./list";

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

// "Пора связаться": the rule lives in due.ts, here it runs by the
// database clock (now())

export async function listDueContacts(groupId?: number) {
  await connection();
  return due.selectDueContacts(getDb(), undefined, groupId);
}

export async function countDueContacts() {
  await connection();
  return due.countDueContacts(getDb());
}

export async function hasContactsWithFrequency() {
  await connection();
  return due.hasContactsWithFrequency(getDb());
}
