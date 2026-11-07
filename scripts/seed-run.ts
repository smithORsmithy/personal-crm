// Test data: what `pnpm db:seed` does, as a function of the database (or a
// transaction), so tests run it on the real test database.
// The data goes to the owner, the user with the email from OWNER_EMAIL:
// an owner without contacts gets 1000 test contacts with notes, in his
// initial groups; an owner with contacts gets no new contacts, only the test
// ones that are in no group are put into groups (seed-groups.ts). Contacts
// added or edited by hand are never touched. Nobody else sees any of it.

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  contactGroups,
  contacts,
  groups,
  notes,
  users,
} from "../src/db/schema";
import type { Database } from "../src/db/types";
import { normalizeEmail } from "../src/lib/auth/email";

import {
  SEED_CONTACT_COUNT,
  SEED_RANDOM_SEED,
  buildGroupLinks,
  generateContacts,
  seedGroupNames,
} from "./seed-data";
import { addTestContactsToGroups } from "./seed-groups";

const BATCH_SIZE = 1000;

// The user with this email, however it is written; created the way
// migration 0006 does when he has not signed in yet
async function findOrCreateOwner(db: Database, email: string): Promise<string> {
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (found) {
    return found.id;
  }
  const [created] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name: "",
      email,
      emailVerified: true,
    })
    .returning({ id: users.id });
  return created.id;
}

// Returns the line for the terminal
export async function seedOwnerData(
  db: Database,
  ownerEmail: unknown,
): Promise<string> {
  const typed = typeof ownerEmail === "string" ? ownerEmail.trim() : "";
  if (!typed) {
    throw new Error("OWNER_EMAIL is not set");
  }
  const email = normalizeEmail(typed);
  if (!email) {
    throw new Error("OWNER_EMAIL is not a valid email address");
  }

  return db.transaction(async (tx) => {
    const ownerId = await findOrCreateOwner(tx, email);
    const [{ value: existing }] = await tx
      .select({ value: count() })
      .from(contacts)
      .where(eq(contacts.ownerId, ownerId));
    const seedContacts = generateContacts(SEED_CONTACT_COUNT, SEED_RANDOM_SEED);

    if (existing > 0) {
      const put = await addTestContactsToGroups(tx, ownerId, seedContacts);
      return put.contacts > 0
        ? `Put ${put.contacts} test contacts into groups (${put.links} group links). Contacts and notes are unchanged.`
        : "No test contacts without groups. Nothing changed.";
    }

    const inserted = await tx
      .insert(contacts)
      .values(seedContacts.map((item) => ({ ...item.contact, ownerId })))
      .returning({ id: contacts.id });

    // Identity ids grow in insert order, so sorted ids match the input order
    const ids = inserted.map((row) => row.id).sort((a, b) => a - b);
    const noteRows = seedContacts.flatMap((item, index) =>
      item.notes.map((note) => ({ ...note, contactId: ids[index] })),
    );
    for (let start = 0; start < noteRows.length; start += BATCH_SIZE) {
      await tx.insert(notes).values(noteRows.slice(start, start + BATCH_SIZE));
    }

    // Put people into the owner's initial groups; groups he lacks (renamed
    // or deleted, or never had) are skipped
    const existingGroups = await tx
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(
        and(
          eq(groups.ownerId, ownerId),
          inArray(groups.name, [...seedGroupNames]),
          isNull(groups.deletedAt),
        ),
      );
    const links = buildGroupLinks(
      seedContacts,
      ids,
      new Map(existingGroups.map((group) => [group.name, group.id])),
    );
    for (let start = 0; start < links.length; start += BATCH_SIZE) {
      await tx
        .insert(contactGroups)
        .values(links.slice(start, start + BATCH_SIZE));
    }

    return `Added ${seedContacts.length} contacts, ${noteRows.length} notes and ${links.length} group links.`;
  });
}
