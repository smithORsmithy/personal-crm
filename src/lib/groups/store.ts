// Queries on groups. Every function takes the database (or a transaction)
// and the user, and knows nothing about Next.js, so tests run them on the
// real test database. The app calls them through queries.ts and actions.ts.
// A user works only with their own groups and contacts: someone else's group
// or contact is answered like one that does not exist.
// A deleted group (deleted_at is set) and a deleted contact are hidden
// everywhere here, even during the seconds they can be brought back.

import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";

import { contactGroups, contacts, groups } from "@/db/schema";
import type { Database } from "@/db/types";
import { KEEP_DELETED_SECONDS, UNDO_SECONDS } from "@/lib/undo-window";

// Groups in Russian alphabetical order, as contact names
const byName = sql`${groups.name} collate "ru-x-icu"`;

// Deleted groups older than the undo window: the database clock decides
const pastUndoWindow = sql`now() - interval '1 second' * ${KEEP_DELETED_SECONDS}`;

// This user's group that is not deleted
function ownGroup(ownerId: string, id: number) {
  return and(
    eq(groups.id, id),
    eq(groups.ownerId, ownerId),
    isNull(groups.deletedAt),
  );
}

// All groups of the user with the number of people in each
export async function listGroups(db: Database, ownerId: string) {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: count(contacts.id),
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .leftJoin(
      contacts,
      and(eq(contacts.id, contactGroups.contactId), isNull(contacts.deletedAt)),
    )
    .where(and(eq(groups.ownerId, ownerId), isNull(groups.deletedAt)))
    .groupBy(groups.id)
    .orderBy(byName, asc(groups.id));
}

export type GroupListItem = Awaited<ReturnType<typeof listGroups>>[number];

// The groups one contact is in. Only the user's own groups are listed, so
// for someone else's contact the answer is empty.
export async function listContactGroups(
  db: Database,
  ownerId: string,
  contactId: number,
) {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        eq(groups.ownerId, ownerId),
        isNull(groups.deletedAt),
      ),
    )
    .orderBy(byName, asc(groups.id));
}

// Postgres error 23505: a unique index refused the row. Drizzle wraps the
// original error, so the code sits in `cause`.
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return cause?.code === "23505";
}

// A group of the user by name, capitals ignored: "теннис" finds "Теннис"
export async function findGroupByName(
  db: Database,
  ownerId: string,
  name: string,
) {
  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.ownerId, ownerId),
        sql`lower(${groups.name}) = lower(${name})`,
        isNull(groups.deletedAt),
      ),
    );
  return group ?? null;
}

export type CreateOutcome =
  | { status: "created"; group: { id: number; name: string } }
  | { status: "exists"; group: { id: number; name: string } };

// ON CONFLICT instead of catching an error: a taken name is not a failure
// of the query, and the existing group's exact spelling is wanted
export async function createGroup(
  db: Database,
  ownerId: string,
  name: string,
): Promise<CreateOutcome> {
  const [created] = await db
    .insert(groups)
    .values({ ownerId, name })
    .onConflictDoNothing()
    .returning({ id: groups.id, name: groups.name });
  if (created) {
    return { status: "created", group: created };
  }
  // Deleted by someone else in this very moment: then the name is free,
  // but the one who asked just gets the same answer as for a taken name
  const existing = await findGroupByName(db, ownerId, name);
  return { status: "exists", group: existing ?? { id: 0, name } };
}

export type RenameOutcome =
  | { status: "renamed" }
  | { status: "taken"; name: string }
  | { status: "not_found" };

export async function renameGroup(
  db: Database,
  ownerId: string,
  id: number,
  name: string,
): Promise<RenameOutcome> {
  try {
    // A nested transaction: a refused row must not break an outer one
    const updated = await db.transaction((tx) =>
      tx
        .update(groups)
        .set({ name })
        .where(ownGroup(ownerId, id))
        .returning({ id: groups.id }),
    );
    return updated.length > 0 ? { status: "renamed" } : { status: "not_found" };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const existing = await findGroupByName(db, ownerId, name);
    return { status: "taken", name: existing?.name ?? name };
  }
}

// Deleting only marks the group: for a few seconds "Отменить" can bring it
// back with all its people. Returns false if it was gone already (or is not
// the user's).
export async function softDeleteGroup(
  db: Database,
  ownerId: string,
  id: number,
): Promise<boolean> {
  const deleted = await db
    .update(groups)
    .set({ deletedAt: sql`now()` })
    .where(ownGroup(ownerId, id))
    .returning({ id: groups.id });
  return deleted.length > 0;
}

export type RestoreOutcome =
  | { status: "restored" }
  | { status: "expired" }
  | { status: "taken"; name: string };

export async function restoreGroup(
  db: Database,
  ownerId: string,
  id: number,
): Promise<RestoreOutcome> {
  try {
    const restored = await db.transaction((tx) =>
      tx
        .update(groups)
        .set({ deletedAt: null })
        .where(
          and(
            eq(groups.id, id),
            eq(groups.ownerId, ownerId),
            isNotNull(groups.deletedAt),
            gt(groups.deletedAt, pastUndoWindow),
          ),
        )
        .returning({ id: groups.id }),
    );
    return restored.length > 0 ? { status: "restored" } : { status: "expired" };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A new group took the name in these seconds
    const [own] = await db
      .select({ name: groups.name })
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)));
    const existing = own ? await findGroupByName(db, ownerId, own.name) : null;
    return { status: "taken", name: existing?.name ?? own?.name ?? "" };
  }
}

// Erases for good every group past the undo window, whoever it belongs to;
// its links go with it (ON DELETE CASCADE), the contacts stay
export async function eraseExpiredGroups(db: Database): Promise<number> {
  const erased = await db
    .delete(groups)
    .where(
      and(isNotNull(groups.deletedAt), lte(groups.deletedAt, pastUndoWindow)),
    )
    .returning({ id: groups.id });
  return erased.length;
}

// A group of the user deleted moments ago, for the "удалена / Отменить"
// message. The time left is counted by the database clock, the same that
// stamped deleted_at, so the browser's clock does not matter. Once the time
// to undo has run out there is nothing to show: null.
export async function getRecentlyDeletedGroup(
  db: Database,
  ownerId: string,
  id: number,
) {
  const [group] = await db
    .select({
      id: groups.id,
      name: groups.name,
      undoMsLeft: sql<number>`greatest(0, extract(epoch from ${groups.deletedAt} + interval '1 second' * ${UNDO_SECONDS} - now()) * 1000)::int`,
    })
    .from(groups)
    .where(
      and(
        eq(groups.id, id),
        eq(groups.ownerId, ownerId),
        isNotNull(groups.deletedAt),
      ),
    );
  return group && group.undoMsLeft > 0 ? group : null;
}

export type MembershipOutcome =
  | { status: "ok" }
  | { status: "contact_not_found" }
  | { status: "group_not_found" };

async function contactExists(
  db: Database,
  ownerId: string,
  id: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.ownerId, ownerId),
        isNull(contacts.deletedAt),
      ),
    );
  return rows.length > 0;
}

async function groupExists(
  db: Database,
  ownerId: string,
  id: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(ownGroup(ownerId, id));
  return rows.length > 0;
}

// One group at a time, not "the whole set": two browsers adding the same
// person to different groups at once both keep their change. A person and a
// group are joined only when both are the user's own.
export async function addContactToGroup(
  db: Database,
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<MembershipOutcome> {
  if (!(await contactExists(db, ownerId, contactId))) {
    return { status: "contact_not_found" };
  }
  if (!(await groupExists(db, ownerId, groupId))) {
    return { status: "group_not_found" };
  }
  await db
    .insert(contactGroups)
    .values({ contactId, groupId })
    .onConflictDoNothing();
  return { status: "ok" };
}

export async function removeContactFromGroup(
  db: Database,
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<MembershipOutcome> {
  if (!(await contactExists(db, ownerId, contactId))) {
    return { status: "contact_not_found" };
  }
  if (!(await groupExists(db, ownerId, groupId))) {
    return { status: "group_not_found" };
  }
  await db
    .delete(contactGroups)
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        eq(contactGroups.groupId, groupId),
      ),
    );
  return { status: "ok" };
}

// The group of the user with this name (capitals ignored): the existing one,
// or a new one
export async function findOrCreateGroup(
  db: Database,
  ownerId: string,
  name: string,
): Promise<{ id: number; name: string }> {
  // Twice: the group found by a failed insert may be deleted in that very
  // moment, then the name is free and the second try creates it
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await createGroup(db, ownerId, name);
    if (outcome.group.id !== 0) {
      return outcome.group;
    }
  }
  throw new Error("Could not find or create the group");
}

// "Создать группу «…»" in the card: the group and the person in it, together
export async function addContactToNewGroup(
  db: Database,
  ownerId: string,
  contactId: number,
  name: string,
): Promise<MembershipOutcome> {
  return db.transaction(async (tx) => {
    if (!(await contactExists(tx, ownerId, contactId))) {
      return { status: "contact_not_found" } as const;
    }
    const group = await findOrCreateGroup(tx, ownerId, name);
    await tx
      .insert(contactGroups)
      .values({ contactId, groupId: group.id })
      .onConflictDoNothing();
    return { status: "ok" } as const;
  });
}

export type GroupSelection = {
  // Groups chosen in the form
  groupIds: number[];
  // Names typed in the form: the group is found by name or created
  newGroups: string[];
};

// "Сохранить" in the add/edit form: the person's groups become exactly the
// chosen ones. The contact is the user's own (the caller checked). Groups
// deleted while the form was open, and numbers of groups that are not the
// user's, are skipped without a word. Links to groups deleted but still
// undoable are left alone, so "Отменить" brings them back with the person.
export async function setContactGroups(
  db: Database,
  ownerId: string,
  contactId: number,
  selection: GroupSelection,
): Promise<void> {
  await db.transaction(async (tx) => {
    const chosen = new Set<number>();

    if (selection.groupIds.length > 0) {
      const existing = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(
            inArray(groups.id, selection.groupIds),
            eq(groups.ownerId, ownerId),
            isNull(groups.deletedAt),
          ),
        );
      for (const group of existing) {
        chosen.add(group.id);
      }
    }
    for (const name of selection.newGroups) {
      chosen.add((await findOrCreateGroup(tx, ownerId, name)).id);
    }

    const chosenIds = [...chosen];
    await tx.delete(contactGroups).where(
      and(
        eq(contactGroups.contactId, contactId),
        inArray(
          contactGroups.groupId,
          tx
            .select({ id: groups.id })
            .from(groups)
            .where(and(eq(groups.ownerId, ownerId), isNull(groups.deletedAt))),
        ),
        chosenIds.length > 0
          ? notInArray(contactGroups.groupId, chosenIds)
          : undefined,
      ),
    );
    if (chosenIds.length > 0) {
      await tx
        .insert(contactGroups)
        .values(chosenIds.map((groupId) => ({ contactId, groupId })))
        .onConflictDoNothing();
    }
  });
}
