import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contacts, groups } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback } from "../../../test/db";
import { addContact, groupIdByName } from "../../../test/fixtures";

import { createContactWithGroups, updateContactWithGroups } from "@/lib/contacts/save";

import { listContactGroups, listGroups } from "./store";
import { formatContactCount } from "./text";

describe("Initial groups", () => {
  it("Пять групп после обновления", async () => {
    await withRollback(async (db) => {
      const groups = await listGroups(db);
      expect(groups.map((group) => group.name)).toEqual([
        "Аналитики",
        "Друзья",
        "Знакомые",
        "Семья",
        "Теннис",
      ]);
      expect(groups.map((group) => group.contactCount)).toEqual([
        0, 0, 0, 0, 0,
      ]);
    });
  });

  it("Контакты, которые были до обновления", async () => {
    await withRollback(async (db) => {
      const [contact] = await db
        .insert(contacts)
        .values({ name: "Старый контакт" })
        .returning();
      expect(await listContactGroups(db, contact.id)).toEqual([]);
    });
  });
});

describe("Group table rules", () => {
  // A failed statement breaks a transaction; a savepoint keeps the test going
  async function rejected(db: Database, name: string) {
    return db
      .transaction((tx) => tx.insert(groups).values({ name }))
      .then(
        () => false,
        () => true,
      );
  }

  it("база сама не пускает неверные группы", async () => {
    await withRollback(async (db) => {
      expect(await rejected(db, " Йога ")).toBe(true);
      expect(await rejected(db, "")).toBe(true);
      expect(await rejected(db, "я".repeat(51))).toBe(true);
      expect(await rejected(db, "теннис")).toBe(true);
      expect(await rejected(db, "я".repeat(50))).toBe(false);
    });
  });

  it("новая группа с названием удалённой создаётся", async () => {
    await withRollback(async (db) => {
      await db
        .update(groups)
        .set({ deletedAt: new Date() })
        .where(eq(groups.name, "Теннис"));
      expect(await rejected(db, "Теннис")).toBe(false);
    });
  });
});

describe("Group list", () => {
  it("Список групп", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Анна", ["Теннис"]);
      await addContact(db, "Олег", ["Теннис"]);
      await addContact(db, "Ира", ["Теннис", "Семья"]);

      const list = await listGroups(db);
      const find = (name: string) => list.find((group) => group.name === name);
      expect(find("Теннис")?.contactCount).toBe(3);
      expect(find("Семья")?.contactCount).toBe(1);
      expect(formatContactCount(3)).toBe("3 контакта");
      expect(formatContactCount(1)).toBe("1 контакт");
      expect(formatContactCount(0)).toBe("0 контактов");
    });
  });
});

describe("Contact form with groups", () => {
  const person = (name: string) => ({
    name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
  });
  const namesOf = async (db: Database, contactId: number) =>
    (await listContactGroups(db, contactId)).map((group) => group.name);

  it("Новый контакт сразу в группах", async () => {
    await withRollback(async (db) => {
      const family = await groupIdByName(db, "Семья");
      const tennis = await groupIdByName(db, "Теннис");
      const id = await createContactWithGroups(db, person("Вера"), {
        groupIds: [tennis, family],
        newGroups: [],
      });
      expect(await namesOf(db, id)).toEqual(["Семья", "Теннис"]);
    });
  });

  it("Новая группа из формы", async () => {
    await withRollback(async (db) => {
      const id = await createContactWithGroups(db, person("Вера"), {
        groupIds: [],
        newGroups: ["Йога"],
      });
      expect(await namesOf(db, id)).toEqual(["Йога"]);
      const yoga = (await listGroups(db)).find((group) => group.name === "Йога");
      expect(yoga?.contactCount).toBe(1);

      // The same name in other capitals is the same group
      const second = await createContactWithGroups(db, person("Лена"), {
        groupIds: [],
        newGroups: ["йога"],
      });
      expect(await namesOf(db, second)).toEqual(["Йога"]);
      expect(await listGroups(db)).toHaveLength(6);
    });
  });

  it("Поменять группы в «Изменить»", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Друзья"]);
      const family = await groupIdByName(db, "Семья");
      const saved = await updateContactWithGroups(db, anna, person("Анна"), {
        groupIds: [family],
        newGroups: [],
      });
      expect(saved).toBe(true);
      expect(await namesOf(db, anna)).toEqual(["Семья"]);
    });
  });

  // The typed and not picked name comes to the server as a new group name
  it("Вписанное название существующей группы", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      const saved = await updateContactWithGroups(db, anna, person("Анна"), {
        groupIds: [],
        newGroups: ["аналитики"],
      });
      expect(saved).toBe(true);
      expect(await namesOf(db, anna)).toEqual(["Аналитики"]);
      expect(await listGroups(db)).toHaveLength(5);

      // Picked as a label and typed once more: still one group
      const analysts = await groupIdByName(db, "Аналитики");
      await updateContactWithGroups(db, anna, person("Анна"), {
        groupIds: [analysts],
        newGroups: ["Аналитики"],
      });
      expect(await namesOf(db, anna)).toEqual(["Аналитики"]);
    });
  });

  it("Вписанное новое название", async () => {
    await withRollback(async (db) => {
      const vera = await createContactWithGroups(db, person("Вера"), {
        groupIds: [],
        newGroups: ["Йога"],
      });
      expect(await namesOf(db, vera)).toEqual(["Йога"]);
      const yoga = (await listGroups(db)).find((group) => group.name === "Йога");
      expect(yoga?.contactCount).toBe(1);
    });
  });

  it("Группа, удалённая за время заполнения формы, пропускается", async () => {
    await withRollback(async (db) => {
      const tennis = await groupIdByName(db, "Теннис");
      const family = await groupIdByName(db, "Семья");
      await db
        .update(groups)
        .set({ deletedAt: new Date() })
        .where(eq(groups.id, tennis));
      const id = await createContactWithGroups(db, person("Вера"), {
        groupIds: [tennis, family],
        newGroups: [],
      });
      expect(await namesOf(db, id)).toEqual(["Семья"]);
    });
  });

  it("Изменение удалённого контакта", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, anna));
      expect(
        await updateContactWithGroups(db, anna, person("Анна"), {
          groupIds: [],
          newGroups: ["Йога"],
        }),
      ).toBe(false);
      expect(await listGroups(db)).toHaveLength(5);
    });
  });
});
