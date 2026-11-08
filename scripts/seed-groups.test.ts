import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contactGroups, contacts, notes } from "../src/db/schema";
import { listContactGroups } from "../src/lib/groups/store";
import { withRollback, type TestDb } from "../test/db";
import { groupIdByName } from "../test/fixtures";

import { generateContacts, type SeedContact } from "./seed-data";
import { addTestContactsToGroups } from "./seed-groups";

// A small seed of its own: the function is given the seed to compare with
const seeded = generateContacts(30, 3);
const withGroups = seeded.filter((item) => item.groupNames.length > 0);

async function insertSeeded(
  db: TestDb,
  owner: string,
  item: SeedContact,
  change: Partial<SeedContact["contact"]> = {},
): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values({ ...item.contact, ownerId: owner, ...change })
    .returning({ id: contacts.id });
  return row.id;
}

const groupNamesOf = async (db: TestDb, owner: string, id: number) =>
  (await listContactGroups(db, owner, id)).map((group) => group.name).sort();

const total = async (
  db: TestDb,
  table: typeof contacts | typeof notes | typeof contactGroups,
) => (await db.select({ value: count() }).from(table))[0].value;

describe("pnpm db:seed on a filled database", () => {
  it("Тестовые контакты без групп", async () => {
    await withRollback(async (db, owner) => {
      const ids: number[] = [];
      for (const item of seeded) {
        ids.push(await insertSeeded(db, owner, item));
      }
      await db.insert(notes).values({ contactId: ids[0], body: "Созвонились" });
      const contactsBefore = await total(db, contacts);
      const notesBefore = await total(db, notes);

      const result = await addTestContactsToGroups(db, owner, seeded);

      expect(result.contacts).toBe(withGroups.length);
      expect(result.links).toBe(
        seeded.reduce((sum, item) => sum + item.groupNames.length, 0),
      );
      for (const [index, item] of seeded.entries()) {
        expect(await groupNamesOf(db, owner, ids[index])).toEqual(
          [...item.groupNames].sort(),
        );
      }
      expect(await total(db, contacts)).toBe(contactsBefore);
      expect(await total(db, notes)).toBe(notesBefore);
    });
  });

  it("Свои контакты не трогаются", async () => {
    await withRollback(async (db, owner) => {
      const [ivan] = await db
        .insert(contacts)
        .values({ ownerId: owner, name: "Иван Иванов", about: "сосед по даче" })
        .returning({ id: contacts.id });
      await addTestContactsToGroups(db, owner, seeded);
      expect(await groupNamesOf(db, owner, ivan.id)).toEqual([]);
    });
  });

  it("Изменённый тестовый контакт не трогается", async () => {
    await withRollback(async (db, owner) => {
      const id = await insertSeeded(db, owner, withGroups[0], {
        phone: "+7 999 999-99-99",
      });
      const result = await addTestContactsToGroups(db, owner, seeded);
      expect(result.contacts).toBe(0);
      expect(await groupNamesOf(db, owner, id)).toEqual([]);
    });
  });

  it("Кто уже в группе — не меняется", async () => {
    await withRollback(async (db, owner) => {
      const item = withGroups.find(
        (candidate) => !candidate.groupNames.includes("Аналитики"),
      )!;
      const id = await insertSeeded(db, owner, item);
      // Put into "Аналитики" by hand before the seed
      const analysts = await groupIdByName(db, owner, "Аналитики");
      await db
        .insert(contactGroups)
        .values({ contactId: id, groupId: analysts });

      await addTestContactsToGroups(db, owner, seeded);
      expect(await groupNamesOf(db, owner, id)).toEqual(["Аналитики"]);
    });
  });

  it("Повторный запуск", async () => {
    await withRollback(async (db, owner) => {
      for (const item of seeded) {
        await insertSeeded(db, owner, item);
      }
      await addTestContactsToGroups(db, owner, seeded);
      const linksAfterFirst = await total(db, contactGroups);

      const second = await addTestContactsToGroups(db, owner, seeded);
      expect(second).toEqual({ contacts: 0, links: 0 });
      expect(await total(db, contactGroups)).toBe(linksAfterFirst);
    });
  });

  it("удалённый контакт пропускается", async () => {
    await withRollback(async (db, owner) => {
      const id = await insertSeeded(db, owner, withGroups[0]);
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, id));
      const result = await addTestContactsToGroups(db, owner, seeded);
      expect(result.contacts).toBe(0);
      expect(
        await db
          .select()
          .from(contactGroups)
          .where(eq(contactGroups.contactId, id)),
      ).toEqual([]);
    });
  });
});
