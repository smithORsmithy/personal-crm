// Small helpers to put test data into the test database

import { eq, inArray } from "drizzle-orm";

import { contactGroups, contacts, groups } from "../src/db/schema";

import type { TestDb } from "./db";

// A contact in the given groups (by name; the initial five exist already)
export async function addContact(
  db: TestDb,
  name: string,
  groupNames: string[] = [],
): Promise<number> {
  const [contact] = await db
    .insert(contacts)
    .values({ name })
    .returning({ id: contacts.id });

  if (groupNames.length > 0) {
    const found = await db
      .select({ id: groups.id })
      .from(groups)
      .where(inArray(groups.name, groupNames));
    await db
      .insert(contactGroups)
      .values(found.map((group) => ({ contactId: contact.id, groupId: group.id })));
  }
  return contact.id;
}

export async function groupIdByName(db: TestDb, name: string): Promise<number> {
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.name, name));
  return group.id;
}
