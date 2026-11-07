import "server-only";

import { connection } from "next/server";

import { getDb } from "@/db";
import { requireUserId } from "@/lib/auth/current-user";

import * as store from "./store";

// Groups are always read per request: they change with every edit and
// must look the same in every browser. Only the groups of the signed-in
// user are read. Deleted groups are hidden in store.ts.

export async function listGroups() {
  await connection();
  return store.listGroups(getDb(), await requireUserId());
}

export async function listContactGroups(contactId: number) {
  await connection();
  return store.listContactGroups(getDb(), await requireUserId(), contactId);
}

export async function getRecentlyDeletedGroup(id: number) {
  await connection();
  return store.getRecentlyDeletedGroup(getDb(), await requireUserId(), id);
}

export type RecentlyDeletedGroup = NonNullable<
  Awaited<ReturnType<typeof getRecentlyDeletedGroup>>
>;
