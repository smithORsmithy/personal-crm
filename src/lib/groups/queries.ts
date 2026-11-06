import "server-only";

import { connection } from "next/server";

import { getDb } from "@/db";

import * as store from "./store";

// Groups are always read per request: they change with every edit and
// must look the same in every browser. Deleted groups are hidden in store.ts.

export async function listGroups() {
  await connection();
  return store.listGroups(getDb());
}

export async function listContactGroups(contactId: number) {
  await connection();
  return store.listContactGroups(getDb(), contactId);
}

export async function getRecentlyDeletedGroup(id: number) {
  await connection();
  return store.getRecentlyDeletedGroup(getDb(), id);
}

export type RecentlyDeletedGroup = NonNullable<
  Awaited<ReturnType<typeof getRecentlyDeletedGroup>>
>;
