import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contactGroups, contacts, groups } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback, withUnreachableDb } from "../../../test/db";
import { addContact, groupIdByName } from "../../../test/fixtures";

import {
  addContactToGroupCommand,
  addContactToNewGroupCommand,
  createGroupCommand,
  deleteGroupCommand,
  removeContactFromGroupCommand,
  renameGroupCommand,
  restoreGroupCommand,
} from "./commands";
import {
  eraseExpiredGroups,
  getRecentlyDeletedGroup,
  listContactGroups,
  listGroups,
} from "./store";
import { deleteGroupQuestion } from "./text";

const saveFailed =
  "Не получилось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

async function groupNames(db: Database) {
  return (await listGroups(db)).map((group) => group.name);
}

async function expireDeletion(db: Database, groupId: number) {
  await db
    .update(groups)
    .set({ deletedAt: new Date(Date.now() - 10_000) })
    .where(eq(groups.id, groupId));
}

// A failed database call is logged on purpose; keep the test output clean
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Create a group", () => {
  it("Создать группу", async () => {
    await withRollback(async (db) => {
      const result = await createGroupCommand(db, "Йога");
      expect(result.ok).toBe(true);
      const list = await listGroups(db);
      expect(list.map((group) => group.name)).toEqual([
        "Аналитики",
        "Друзья",
        "Знакомые",
        "Йога",
        "Семья",
        "Теннис",
      ]);
      expect(list.find((group) => group.name === "Йога")?.contactCount).toBe(0);
    });
  });

  it("Такая группа уже есть", async () => {
    await withRollback(async (db) => {
      const result = await createGroupCommand(db, "теннис");
      expect(result).toEqual({
        ok: false,
        error: "Группа «Теннис» уже есть",
        input: "теннис",
      });
      expect(await listGroups(db)).toHaveLength(5);
    });
  });

  it("База недоступна на странице «Группы»", async () => {
    await withUnreachableDb(async (db) => {
      const result = await createGroupCommand(db, "Йога");
      expect(result).toEqual({ ok: false, error: saveFailed, input: "Йога" });
    });
  });

  it("Пробелы по краям при создании", async () => {
    await withRollback(async (db) => {
      await createGroupCommand(db, "  Йога  ");
      expect(await groupNames(db)).toContain("Йога");
    });
  });

  it("Пустое название при создании", async () => {
    await withRollback(async (db) => {
      expect(await createGroupCommand(db, "   ")).toEqual({
        ok: false,
        error: "Укажите название группы",
        input: "   ",
      });
      expect(await listGroups(db)).toHaveLength(5);
    });
  });
});

describe("Rename a group", () => {
  it("Переименовать", async () => {
    await withRollback(async (db) => {
      await addContact(db, "Анна", ["Аналитики"]);
      await addContact(db, "Олег", ["Аналитики"]);
      const id = await groupIdByName(db, "Аналитики");

      expect((await renameGroupCommand(db, id, "Коллеги")).ok).toBe(true);

      const list = await listGroups(db);
      expect(list.map((group) => group.name)).toEqual([
        "Друзья",
        "Знакомые",
        "Коллеги",
        "Семья",
        "Теннис",
      ]);
      expect(list.find((group) => group.name === "Коллеги")?.contactCount).toBe(
        2,
      );
    });
  });

  it("Название занято", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Друзья");
      expect(await renameGroupCommand(db, id, "теннис")).toEqual({
        ok: false,
        error: "Группа «Теннис» уже есть",
        input: "теннис",
      });
      expect(await groupNames(db)).toContain("Друзья");
    });
  });

  it("Поменять только большие и маленькие буквы", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      expect((await renameGroupCommand(db, id, "теннис")).ok).toBe(true);
      expect(await groupNames(db)).toContain("теннис");
    });
  });

  it("Переименование удалённой группы", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);
      expect(await renameGroupCommand(db, id, "Корт")).toEqual({
        ok: false,
        error: "Группа не найдена: возможно, её удалили",
        input: "Корт",
      });
    });
  });

  it("Неверное название при переименовании", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      expect(await renameGroupCommand(db, id, " ")).toMatchObject({
        ok: false,
        error: "Укажите название группы",
      });
    });
  });

  it("База недоступна при переименовании", async () => {
    await withUnreachableDb(async (db) => {
      expect(await renameGroupCommand(db, 1, "Корт")).toEqual({
        ok: false,
        error: saveFailed,
        input: "Корт",
      });
    });
  });
});

describe("Delete a group", () => {
  it("Удалить группу", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Теннис", "Друзья"]);
      const oleg = await addContact(db, "Олег", ["Теннис"]);
      const id = await groupIdByName(db, "Теннис");

      expect(await deleteGroupCommand(db, id)).toEqual({
        ok: true,
        deleted: true,
      });

      expect(await groupNames(db)).not.toContain("Теннис");
      expect((await listContactGroups(db, anna)).map((g) => g.name)).toEqual([
        "Друзья",
      ]);
      expect(await listContactGroups(db, oleg)).toEqual([]);
      // Both are still contacts
      expect(await db.select().from(contacts)).toHaveLength(2);
    });
  });

  it("Пока можно отменить, группы не видно", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Теннис"]);
      const id = await groupIdByName(db, "Теннис");

      await deleteGroupCommand(db, id);

      expect(await groupNames(db)).not.toContain("Теннис");
      expect(await listContactGroups(db, anna)).toEqual([]);
      // The links are still there: that is what "Отменить" brings back
      const links = await db
        .select()
        .from(contactGroups)
        .where(eq(contactGroups.groupId, id));
      expect(links).toHaveLength(1);
    });
  });

  it("Вопрос перед удалением", () => {
    expect(deleteGroupQuestion(3)).toBe(
      "3 контакта выйдут из группы. Сами контакты и их заметки останутся.",
    );
    expect(deleteGroupQuestion(1)).toBe(
      "1 контакт выйдет из группы. Сами контакты и их заметки останутся.",
    );
    expect(deleteGroupQuestion(5)).toBe(
      "5 контактов выйдут из группы. Сами контакты и их заметки останутся.",
    );
    expect(deleteGroupQuestion(0)).toBe("В группе никого нет.");
  });

  it("Удаление уже удалённой группы", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);
      expect(await deleteGroupCommand(db, id)).toEqual({
        ok: true,
        deleted: false,
      });
    });
  });

  it("База недоступна при удалении", async () => {
    await withUnreachableDb(async (db) => {
      expect(await deleteGroupCommand(db, 1)).toEqual({
        ok: false,
        error:
          "Не получилось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.",
      });
    });
  });
});

describe("Undo deleting a group", () => {
  it("Сообщение после удаления", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);

      const notice = await getRecentlyDeletedGroup(db, id);
      expect(notice?.name).toBe("Теннис");
      expect(notice?.undoMsLeft).toBeGreaterThan(4000);
      expect(notice?.undoMsLeft).toBeLessThanOrEqual(5000);
    });
  });

  it("Вернуть группу", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Теннис"]);
      const oleg = await addContact(db, "Олег", ["Теннис"]);
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);

      expect(await restoreGroupCommand(db, id)).toEqual({ ok: true });

      const list = await listGroups(db);
      expect(list.find((group) => group.name === "Теннис")?.contactCount).toBe(
        2,
      );
      expect((await listContactGroups(db, anna)).map((g) => g.name)).toEqual([
        "Теннис",
      ]);
      expect((await listContactGroups(db, oleg)).map((g) => g.name)).toEqual([
        "Теннис",
      ]);
    });
  });

  it("Время на отмену вышло", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);
      await expireDeletion(db, id);

      expect(await restoreGroupCommand(db, id)).toEqual({
        ok: false,
        error:
          "Не получилось вернуть: 5 секунд прошли, группа удалена насовсем.",
      });
      expect(await getRecentlyDeletedGroup(db, id)).toBeNull();
    });
  });

  it("Окончательное стирание", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Теннис"]);
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);
      await expireDeletion(db, id);

      await eraseExpiredGroups(db);

      expect(await db.select().from(groups).where(eq(groups.id, id))).toEqual(
        [],
      );
      expect(
        await db
          .select()
          .from(contactGroups)
          .where(eq(contactGroups.groupId, id)),
      ).toEqual([]);
      // The contact stays
      expect(
        await db.select().from(contacts).where(eq(contacts.id, anna)),
      ).toHaveLength(1);
    });
  });

  it("За это время создали новую группу с тем же названием", async () => {
    await withRollback(async (db) => {
      const id = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, id);
      await createGroupCommand(db, "Теннис");

      expect(await restoreGroupCommand(db, id)).toEqual({
        ok: false,
        error: "Не получилось вернуть: уже есть группа «Теннис».",
      });
    });
  });

  it("База недоступна при отмене", async () => {
    await withUnreachableDb(async (db) => {
      expect(await restoreGroupCommand(db, 1)).toEqual({
        ok: false,
        error:
          "Не получилось вернуть. Проверьте, что база данных запущена, и попробуйте ещё раз.",
      });
    });
  });
});

describe("Groups in the contact card", () => {
  const namesOf = async (db: Database, contactId: number) =>
    (await listContactGroups(db, contactId)).map((group) => group.name);

  it("Добавить в группу", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      const tennis = await groupIdByName(db, "Теннис");
      expect(await addContactToGroupCommand(db, anna, tennis)).toEqual({
        ok: true,
      });
      expect(await namesOf(db, anna)).toEqual(["Теннис"]);
      // The same again changes nothing
      expect(await addContactToGroupCommand(db, anna, tennis)).toEqual({
        ok: true,
      });
      expect(await namesOf(db, anna)).toEqual(["Теннис"]);
    });
  });

  it("Несколько групп", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Теннис"]);
      await addContactToGroupCommand(
        db,
        anna,
        await groupIdByName(db, "Друзья"),
      );
      expect(await namesOf(db, anna)).toEqual(["Друзья", "Теннис"]);
    });
  });

  it("Убрать из группы", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна", ["Друзья", "Теннис"]);
      const tennis = await groupIdByName(db, "Теннис");
      expect(await removeContactFromGroupCommand(db, anna, tennis)).toEqual({
        ok: true,
      });
      expect(await namesOf(db, anna)).toEqual(["Друзья"]);
    });
  });

  it("Создать группу из карточки", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      expect(await addContactToNewGroupCommand(db, anna, "Йога")).toEqual({
        ok: true,
      });
      expect(await namesOf(db, anna)).toEqual(["Йога"]);
      const yoga = (await listGroups(db)).find(
        (group) => group.name === "Йога",
      );
      expect(yoga?.contactCount).toBe(1);
    });
  });

  it("Такая группа уже есть в карточке", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      expect(await addContactToNewGroupCommand(db, anna, "теннис")).toEqual({
        ok: true,
      });
      expect(await namesOf(db, anna)).toEqual(["Теннис"]);
      expect(await listGroups(db)).toHaveLength(5);
    });
  });

  it("Группу удалили в другом браузере", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      const tennis = await groupIdByName(db, "Теннис");
      await deleteGroupCommand(db, tennis);
      expect(await addContactToGroupCommand(db, anna, tennis)).toEqual({
        ok: false,
        error: "Группа не найдена: возможно, её удалили",
      });
      expect(await namesOf(db, anna)).toEqual([]);
    });
  });

  it("Контакт удалили в другом браузере", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, anna));
      const tennis = await groupIdByName(db, "Теннис");
      const gone = {
        ok: false,
        error: "Контакт не найден: возможно, его удалили",
      };
      expect(await addContactToGroupCommand(db, anna, tennis)).toEqual(gone);
      expect(await removeContactFromGroupCommand(db, anna, tennis)).toEqual(
        gone,
      );
      expect(await addContactToNewGroupCommand(db, anna, "Йога")).toEqual(gone);
      expect(await listGroups(db)).toHaveLength(5);
    });
  });

  it("База недоступна в карточке", async () => {
    await withUnreachableDb(async (db) => {
      const failed = { ok: false, error: saveFailed };
      expect(await addContactToGroupCommand(db, 1, 1)).toEqual(failed);
      expect(await removeContactFromGroupCommand(db, 1, 1)).toEqual(failed);
      expect(await addContactToNewGroupCommand(db, 1, "Йога")).toEqual(failed);
    });
  });

  it("Неверное название новой группы в карточке", async () => {
    await withRollback(async (db) => {
      const anna = await addContact(db, "Анна");
      expect(await addContactToNewGroupCommand(db, anna, "  ")).toEqual({
        ok: false,
        error: "Укажите название группы",
      });
    });
  });
});
