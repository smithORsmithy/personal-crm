// `pnpm db:seed`: test data goes to the owner (OWNER_EMAIL), in his groups,
// and nobody else sees it. Runs on the real test database.

import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  contactGroups,
  contacts,
  groups,
  notes,
  users,
} from "../src/db/schema";
import { selectContactList } from "../src/lib/contacts/list";
import { listGroups } from "../src/lib/groups/store";
import { withRollback } from "../test/db";
import { addContact, addUser } from "../test/fixtures";
import { TEST_OWNER_EMAIL } from "../test/recreate-db";

import {
  SEED_CONTACT_COUNT,
  SEED_RANDOM_SEED,
  generateContacts,
} from "./seed-data";
import { seedOwnerData } from "./seed-run";

describe("pnpm db:seed", () => {
  it("Заполнение пустой базы: 1000 contacts of the owner, in his groups", async () => {
    await withRollback(async (db, owner) => {
      const message = await seedOwnerData(db, TEST_OWNER_EMAIL);

      expect(message).toMatch(
        /^Added 1000 contacts, \d+ notes and \d+ group links\./,
      );
      const [{ value: ownContacts }] = await db
        .select({ value: count() })
        .from(contacts)
        .where(eq(contacts.ownerId, owner));
      expect(ownContacts).toBe(SEED_CONTACT_COUNT);

      // Some people are in one or two of the initial five groups, some in none
      const list = await selectContactList(db, owner);
      expect(list.some((contact) => contact.groupIds.length > 0)).toBe(true);
      expect(list.some((contact) => contact.groupIds.length === 0)).toBe(true);
      const tennis = (await listGroups(db, owner)).find(
        (g) => g.name === "Теннис",
      );
      expect(tennis?.contactCount).toBeGreaterThan(0);

      const [{ value: ownNotes }] = await db
        .select({ value: count() })
        .from(notes);
      expect(ownNotes).toBeGreaterThan(0);
    });
  });

  it("Другой пользователь тестовых данных не видит", async () => {
    await withRollback(async (db) => {
      const friend = await addUser(db, "friend@example.test");

      await seedOwnerData(db, TEST_OWNER_EMAIL);

      expect(await selectContactList(db, friend)).toEqual([]);
      expect(await listGroups(db, friend)).toEqual([]);
    });
  });

  it("finds the owner by the email however it is written", async () => {
    await withRollback(async (db, owner) => {
      await seedOwnerData(db, "  Owner@Example.TEST ");

      expect(
        await db.select().from(users).where(eq(users.email, TEST_OWNER_EMAIL)),
      ).toHaveLength(1);
      const [{ value }] = await db
        .select({ value: count() })
        .from(contacts)
        .where(eq(contacts.ownerId, owner));
      expect(value).toBe(SEED_CONTACT_COUNT);
    });
  });

  it("creates the owner when he has not signed in yet; groups he lacks are skipped", async () => {
    await withRollback(async (db) => {
      await seedOwnerData(db, "newcomer@example.test");

      const [created] = await db
        .select()
        .from(users)
        .where(eq(users.email, "newcomer@example.test"));
      expect(created.name).toBe("");
      expect(created.emailVerified).toBe(true);
      const [{ value }] = await db
        .select({ value: count() })
        .from(contacts)
        .where(eq(contacts.ownerId, created.id));
      expect(value).toBe(SEED_CONTACT_COUNT);
      // He has none of the initial groups, so nobody is in a group
      expect(await db.select().from(contactGroups).limit(1)).toEqual([]);
    });
  });

  it("does not add contacts to an owner who has some: only puts the test ones into groups", async () => {
    await withRollback(async (db, owner) => {
      await seedOwnerData(db, TEST_OWNER_EMAIL);
      const before = await db.select({ value: count() }).from(contacts);

      const message = await seedOwnerData(db, TEST_OWNER_EMAIL);

      expect(message).toBe("No test contacts without groups. Nothing changed.");
      expect(await db.select({ value: count() }).from(contacts)).toEqual(
        before,
      );
      expect(owner).toBeTruthy();
    });
  });

  it("Раскладка трогает только контакты и группы владельца", async () => {
    await withRollback(async (db, owner) => {
      // The owner has a contact of his own, so the seed only sorts into groups
      await addContact(db, owner, "Иван Иванов");
      const friend = await addUser(db, "friend@example.test");
      const friendsGroup = await db
        .insert(groups)
        .values({ ownerId: friend, name: "Теннис" })
        .returning({ id: groups.id });
      // A friend's contact that looks exactly like a test contact
      const testLike = generateContacts(
        SEED_CONTACT_COUNT,
        SEED_RANDOM_SEED,
      ).find((item) => item.groupNames.length > 0)!;
      const [{ id: friendsContact }] = await db
        .insert(contacts)
        .values({ ...testLike.contact, ownerId: friend })
        .returning({ id: contacts.id });

      await seedOwnerData(db, TEST_OWNER_EMAIL);

      expect(
        await db
          .select()
          .from(contactGroups)
          .where(
            and(
              eq(contactGroups.contactId, friendsContact),
              eq(contactGroups.groupId, friendsGroup[0].id),
            ),
          ),
      ).toEqual([]);
      expect(await selectContactList(db, friend)).toHaveLength(1);
    });
  });

  it("refuses without a right OWNER_EMAIL and writes nothing", async () => {
    await withRollback(async (db) => {
      await expect(seedOwnerData(db, undefined)).rejects.toThrow(
        "OWNER_EMAIL is not set",
      );
      await expect(seedOwnerData(db, "   ")).rejects.toThrow(
        "OWNER_EMAIL is not set",
      );
      await expect(seedOwnerData(db, "owner@")).rejects.toThrow(
        "OWNER_EMAIL is not a valid email address",
      );
      expect(await db.select().from(contacts)).toEqual([]);
    });
  });
});
