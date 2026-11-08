import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db";
import { requireUserId } from "@/lib/auth/current-user";

import * as due from "./due";
import { selectContactList } from "./list";
import * as read from "./read";

// Contacts and notes are always read per request: the data changes
// with every edit and must look the same in every browser. A page reads the
// signed-in user first (requireUserId) and gets only their contacts: the
// functions below never take the user from the browser.
// A deleted contact (deleted_at is set) is hidden everywhere at once,
// even during the few seconds it can still be brought back.

// The list itself lives in list.ts, here it runs on the app's database
export async function listContacts() {
  await connection();
  return selectContactList(getDb(), await requireUserId());
}

export type { ContactListItem } from "./list";

// cache() dedupes the query within one request: the page title
// and the page body both need the same contact
export const getContact = cache(async (id: number) => {
  await connection();
  return read.getContact(getDb(), await requireUserId(), id);
});

export async function listNotes(contactId: number) {
  await connection();
  return read.listNotes(getDb(), await requireUserId(), contactId);
}

// A contact deleted moments ago, for the "удалён / Отменить" message
export async function getRecentlyDeletedContact(id: number) {
  await connection();
  return read.getRecentlyDeletedContact(getDb(), await requireUserId(), id);
}

export type { RecentlyDeletedContact } from "./read";

// "Пора связаться": the rule lives in due.ts, here it runs by the
// database clock (now())

export async function listDueContacts(groupId?: number) {
  await connection();
  return due.selectDueContacts(
    getDb(),
    await requireUserId(),
    undefined,
    groupId,
  );
}

export async function countDueContacts() {
  await connection();
  return due.countDueContacts(getDb(), await requireUserId());
}

export async function hasContactsWithFrequency() {
  await connection();
  return due.hasContactsWithFrequency(getDb(), await requireUserId());
}
