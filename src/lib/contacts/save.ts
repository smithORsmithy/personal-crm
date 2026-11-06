// Saving a contact together with its groups, in one transaction: either
// both are saved or neither. No "server-only" and no Next.js: the actions
// call these, and tests run them on the real test database.

import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";
import { setContactGroups, type GroupSelection } from "@/lib/groups/store";

import type { contactSchema } from "./validation";

export type ContactInput = z.output<typeof contactSchema>;

export async function createContactWithGroups(
  db: Database,
  data: ContactInput,
  selection: GroupSelection,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contacts)
      .values(data)
      .returning({ id: contacts.id });
    await setContactGroups(tx, created.id, selection);
    return created.id;
  });
}

// false: the contact is gone (deleted in another browser), nothing is saved
export async function updateContactWithGroups(
  db: Database,
  id: number,
  data: ContactInput,
  selection: GroupSelection,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(contacts)
      .set(data)
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return false;
    }
    await setContactGroups(tx, id, selection);
    return true;
  });
}
