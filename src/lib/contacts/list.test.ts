import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contacts, groups } from "@/db/schema";
import { listGroups } from "@/lib/groups/store";

import { withRollback } from "../../../test/db";
import { addContact, groupIdByName } from "../../../test/fixtures";

import { selectContactList } from "./list";

describe("Contact list", () => {
  it("Метки в строке", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Анна", ["Теннис", "Друзья"]);
      const [anna] = await selectContactList(db);
      // In the order of the group names: Друзья, Теннис
      expect(anna.groupIds).toEqual([
        await groupIdByName(db, "Друзья"),
        await groupIdByName(db, "Теннис"),
      ]);
    });
  });

  it("Человек без групп", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Олег");
      const [oleg] = await selectContactList(db);
      expect(oleg.groupIds).toEqual([]);
    });
  });

  it("Удалённый контакт в список не попадает", async () => {
    await withRollback(async (db) => {
      const id = await addContact(db, "Олег", ["Теннис"]);
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, id));
      expect(await selectContactList(db)).toEqual([]);
    });
  });

  it("Удалённая группа в метках не видна", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Анна", ["Теннис", "Друзья"]);
      const tennis = await groupIdByName(db, "Теннис");
      await db
        .update(groups)
        .set({ deletedAt: new Date() })
        .where(eq(groups.id, tennis));
      const [anna] = await selectContactList(db);
      expect(anna.groupIds).toEqual([await groupIdByName(db, "Друзья")]);
    });
  });

  it("Удалённый не считается в группе", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Анна", ["Теннис"]);
      const oleg = await addContact(db, "Олег", ["Теннис"]);
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, oleg));
      const tennis = (await listGroups(db)).find((g) => g.name === "Теннис");
      expect(tennis?.contactCount).toBe(1);
    });
  });

  it("Отменить возвращает группы", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Анна", ["Теннис"]);
      const oleg = await addContact(db, "Олег", ["Теннис"]);
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, oleg));
      // "Отменить": the mark is removed
      await db
        .update(contacts)
        .set({ deletedAt: null })
        .where(eq(contacts.id, oleg));

      const list = await selectContactList(db);
      const tennis = await groupIdByName(db, "Теннис");
      expect(list.find((c) => c.name === "Олег")?.groupIds).toEqual([tennis]);
      expect(
        (await listGroups(db)).find((g) => g.name === "Теннис")?.contactCount,
      ).toBe(2);
    });
  });
});
