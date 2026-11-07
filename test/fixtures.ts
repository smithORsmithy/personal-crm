// Small helpers to put test data into the test database

import { and, eq, inArray } from "drizzle-orm";

import { contactGroups, contacts, groups, users } from "../src/db/schema";

import type { TestDb } from "./db";

// Another user, as a friend who signed in: no contacts and no groups.
// Returns the id.
export async function addUser(db: TestDb, email: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      id: `user-${email}`,
      name: "",
      email,
      emailVerified: true,
    })
    .returning({ id: users.id });
  return user.id;
}

// A group of the user. The owner has the initial five already; for anyone
// else a group is created here.
export async function addGroup(
  db: TestDb,
  ownerId: string,
  name: string,
): Promise<number> {
  const [group] = await db
    .insert(groups)
    .values({ ownerId, name })
    .returning({ id: groups.id });
  return group.id;
}

// A contact of the user in the given groups (by name, among the user's own)
export async function addContact(
  db: TestDb,
  ownerId: string,
  name: string,
  groupNames: string[] = [],
): Promise<number> {
  const [contact] = await db
    .insert(contacts)
    .values({ ownerId, name })
    .returning({ id: contacts.id });

  if (groupNames.length > 0) {
    const found = await db
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(eq(groups.ownerId, ownerId), inArray(groups.name, groupNames)),
      );
    await db
      .insert(contactGroups)
      .values(
        found.map((group) => ({ contactId: contact.id, groupId: group.id })),
      );
  }
  return contact.id;
}

export async function groupIdByName(
  db: TestDb,
  ownerId: string,
  name: string,
): Promise<number> {
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.ownerId, ownerId), eq(groups.name, name)));
  return group.id;
}
