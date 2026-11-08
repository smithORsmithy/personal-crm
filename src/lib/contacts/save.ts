// Saving a contact together with its groups, in one transaction: either
// both are saved or neither. No "server-only" and no Next.js: the actions
// call these, and tests run them on the real test database.

import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";
import { setContactGroups, type GroupSelection } from "@/lib/groups/store";

import type { FrequencyChoice } from "./form-values";
import { ownDateColumns } from "./own-date";
import type { contactSchema } from "./validation";

export type ContactInput = z.output<typeof contactSchema>;

// "Как часто общаться" from the add form is saved in the same go:
// a contact is never added with its frequency lost
export async function createContactWithGroups(
  db: Database,
  ownerId: string,
  data: ContactInput,
  selection: GroupSelection,
  choice: FrequencyChoice = { frequency: null },
): Promise<number> {
  return db.transaction(async (tx) => {
    const frequencyColumns =
      choice.frequency === "on_date"
        ? await ownDateColumns(tx, choice.dayMonth)
        : { contactFrequency: choice.frequency };
    const [created] = await tx
      .insert(contacts)
      .values({ ...data, ...frequencyColumns, ownerId })
      .returning({ id: contacts.id });
    await setContactGroups(tx, ownerId, created.id, selection);
    return created.id;
  });
}

// false: the contact is gone (deleted in another browser) or is someone
// else's, nothing is saved
export async function updateContactWithGroups(
  db: Database,
  ownerId: string,
  id: number,
  data: ContactInput,
  selection: GroupSelection,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(contacts)
      .set(data)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.ownerId, ownerId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return false;
    }
    await setContactGroups(tx, ownerId, id, selection);
    return true;
  });
}
