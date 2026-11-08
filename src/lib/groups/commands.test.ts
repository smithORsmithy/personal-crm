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

async function groupNames(db: Database, owner: string) {
  return (await listGroups(db, owner)).map((group) => group.name);
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
    await withRollback(async (db, owner) => {
      const result = await createGroupCommand(db, owner, "Йога");
      expect(result.ok).toBe(true);
      const list = await listGroups(db, owner);
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
    await withRollback(async (db, owner) => {
      const result = await createGroupCommand(db, owner, "теннис");
      expect(result).toEqual({
        ok: false,
        error: "Группа «Теннис» уже есть",
        input: "теннис",
      });
      expect(await listGroups(db, owner)).toHaveLength(5);
    });
  });

  it("База недоступна на странице «Группы»", async () => {
    await withUnreachableDb(async (db, owner) => {
      const result = await createGroupCommand(db, owner, "Йога");
      expect(result).toEqual({ ok: false, error: saveFailed, input: "Йога" });
    });
  });

  it("Пробелы по краям при создании", async () => {
    await withRollback(async (db, owner) => {
      await createGroupCommand(db, owner, "  Йога  ");
      expect(await groupNames(db, owner)).toContain("Йога");
    });
  });

  it("Пустое название при создании", async () => {
    await withRollback(async (db, owner) => {
      expect(await createGroupCommand(db, owner, "   ")).toEqual({
        ok: false,
        error: "Укажите название группы",
        input: "   ",
      });
      expect(await listGroups(db, owner)).toHaveLength(5);
    });
  });
});

describe("Rename a group", () => {
  it("Переименовать", async () => {
    await withRollback(async (db, owner) => {
      await addContact(db, owner, "Анна", ["Аналитики"]);
      await addContact(db, owner, "Олег", ["Аналитики"]);
      const id = await groupIdByName(db, owner, "Аналитики");

      expect((await renameGroupCommand(db, owner, id, "Коллеги")).ok).toBe(
        true,
      );

      const list = await listGroups(db, owner);
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
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Друзья");
      expect(await renameGroupCommand(db, owner, id, "теннис")).toEqual({
        ok: false,
        error: "Группа «Теннис» уже есть",
        input: "теннис",
      });
      expect(await groupNames(db, owner)).toContain("Друзья");
    });
  });

  it("Поменять только большие и маленькие буквы", async () => {
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      expect((await renameGroupCommand(db, owner, id, "теннис")).ok).toBe(true);
      expect(await groupNames(db, owner)).toContain("теннис");
    });
  });

  it("Переименование удалённой группы", async () => {
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);
      expect(await renameGroupCommand(db, owner, id, "Корт")).toEqual({
        ok: false,
        error: "Группа не найдена: возможно, её удалили",
        input: "Корт",
      });
    });
  });

  it("Неверное название при переименовании", async () => {
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      expect(await renameGroupCommand(db, owner, id, " ")).toMatchObject({
        ok: false,
        error: "Укажите название группы",
      });
    });
  });

  it("База недоступна при переименовании", async () => {
    await withUnreachableDb(async (db, owner) => {
      expect(await renameGroupCommand(db, owner, 1, "Корт")).toEqual({
        ok: false,
        error: saveFailed,
        input: "Корт",
      });
    });
  });
});

describe("Delete a group", () => {
  it("Удалить группу", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна", ["Теннис", "Друзья"]);
      const oleg = await addContact(db, owner, "Олег", ["Теннис"]);
      const id = await groupIdByName(db, owner, "Теннис");

      expect(await deleteGroupCommand(db, owner, id)).toEqual({
        ok: true,
        deleted: true,
      });

      expect(await groupNames(db, owner)).not.toContain("Теннис");
      expect(
        (await listContactGroups(db, owner, anna)).map((g) => g.name),
      ).toEqual(["Друзья"]);
      expect(await listContactGroups(db, owner, oleg)).toEqual([]);
      // Both are still contacts
      expect(await db.select().from(contacts)).toHaveLength(2);
    });
  });

  it("Пока можно отменить, группы не видно", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна", ["Теннис"]);
      const id = await groupIdByName(db, owner, "Теннис");

      await deleteGroupCommand(db, owner, id);

      expect(await groupNames(db, owner)).not.toContain("Теннис");
      expect(await listContactGroups(db, owner, anna)).toEqual([]);
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
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);
      expect(await deleteGroupCommand(db, owner, id)).toEqual({
        ok: true,
        deleted: false,
      });
    });
  });

  it("База недоступна при удалении", async () => {
    await withUnreachableDb(async (db, owner) => {
      expect(await deleteGroupCommand(db, owner, 1)).toEqual({
        ok: false,
        error:
          "Не получилось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.",
      });
    });
  });
});

describe("Undo deleting a group", () => {
  it("Сообщение после удаления", async () => {
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);

      const notice = await getRecentlyDeletedGroup(db, owner, id);
      expect(notice?.name).toBe("Теннис");
      expect(notice?.undoMsLeft).toBeGreaterThan(4000);
      expect(notice?.undoMsLeft).toBeLessThanOrEqual(5000);
    });
  });

  it("Вернуть группу", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна", ["Теннис"]);
      const oleg = await addContact(db, owner, "Олег", ["Теннис"]);
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);

      expect(await restoreGroupCommand(db, owner, id)).toEqual({ ok: true });

      const list = await listGroups(db, owner);
      expect(list.find((group) => group.name === "Теннис")?.contactCount).toBe(
        2,
      );
      expect(
        (await listContactGroups(db, owner, anna)).map((g) => g.name),
      ).toEqual(["Теннис"]);
      expect(
        (await listContactGroups(db, owner, oleg)).map((g) => g.name),
      ).toEqual(["Теннис"]);
    });
  });

  it("Время на отмену вышло", async () => {
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);
      await expireDeletion(db, id);

      expect(await restoreGroupCommand(db, owner, id)).toEqual({
        ok: false,
        error:
          "Не получилось вернуть: 5 секунд прошли, группа удалена насовсем.",
      });
      expect(await getRecentlyDeletedGroup(db, owner, id)).toBeNull();
    });
  });

  it("Окончательное стирание", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна", ["Теннис"]);
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);
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
    await withRollback(async (db, owner) => {
      const id = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, id);
      await createGroupCommand(db, owner, "Теннис");

      expect(await restoreGroupCommand(db, owner, id)).toEqual({
        ok: false,
        error: "Не получилось вернуть: уже есть группа «Теннис».",
      });
    });
  });

  it("База недоступна при отмене", async () => {
    await withUnreachableDb(async (db, owner) => {
      expect(await restoreGroupCommand(db, owner, 1)).toEqual({
        ok: false,
        error:
          "Не получилось вернуть. Проверьте, что база данных запущена, и попробуйте ещё раз.",
      });
    });
  });
});

describe("Groups in the contact card", () => {
  const namesOf = async (db: Database, owner: string, contactId: number) =>
    (await listContactGroups(db, owner, contactId)).map((group) => group.name);

  it("Добавить в группу", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна");
      const tennis = await groupIdByName(db, owner, "Теннис");
      expect(await addContactToGroupCommand(db, owner, anna, tennis)).toEqual({
        ok: true,
      });
      expect(await namesOf(db, owner, anna)).toEqual(["Теннис"]);
      // The same again changes nothing
      expect(await addContactToGroupCommand(db, owner, anna, tennis)).toEqual({
        ok: true,
      });
      expect(await namesOf(db, owner, anna)).toEqual(["Теннис"]);
    });
  });

  it("Несколько групп", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна", ["Теннис"]);
      await addContactToGroupCommand(
        db,
        owner,
        anna,
        await groupIdByName(db, owner, "Друзья"),
      );
      expect(await namesOf(db, owner, anna)).toEqual(["Друзья", "Теннис"]);
    });
  });

  it("Убрать из группы", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна", ["Друзья", "Теннис"]);
      const tennis = await groupIdByName(db, owner, "Теннис");
      expect(
        await removeContactFromGroupCommand(db, owner, anna, tennis),
      ).toEqual({
        ok: true,
      });
      expect(await namesOf(db, owner, anna)).toEqual(["Друзья"]);
    });
  });

  it("Создать группу из карточки", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна");
      expect(
        await addContactToNewGroupCommand(db, owner, anna, "Йога"),
      ).toEqual({
        ok: true,
      });
      expect(await namesOf(db, owner, anna)).toEqual(["Йога"]);
      const yoga = (await listGroups(db, owner)).find(
        (group) => group.name === "Йога",
      );
      expect(yoga?.contactCount).toBe(1);
    });
  });

  it("Такая группа уже есть в карточке", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна");
      expect(
        await addContactToNewGroupCommand(db, owner, anna, "теннис"),
      ).toEqual({
        ok: true,
      });
      expect(await namesOf(db, owner, anna)).toEqual(["Теннис"]);
      expect(await listGroups(db, owner)).toHaveLength(5);
    });
  });

  it("Группу удалили в другом браузере", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна");
      const tennis = await groupIdByName(db, owner, "Теннис");
      await deleteGroupCommand(db, owner, tennis);
      expect(await addContactToGroupCommand(db, owner, anna, tennis)).toEqual({
        ok: false,
        error: "Группа не найдена: возможно, её удалили",
      });
      expect(await namesOf(db, owner, anna)).toEqual([]);
    });
  });

  it("Контакт удалили в другом браузере", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна");
      await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, anna));
      const tennis = await groupIdByName(db, owner, "Теннис");
      const gone = {
        ok: false,
        error: "Контакт не найден: возможно, его удалили",
      };
      expect(await addContactToGroupCommand(db, owner, anna, tennis)).toEqual(
        gone,
      );
      expect(
        await removeContactFromGroupCommand(db, owner, anna, tennis),
      ).toEqual(gone);
      expect(
        await addContactToNewGroupCommand(db, owner, anna, "Йога"),
      ).toEqual(gone);
      expect(await listGroups(db, owner)).toHaveLength(5);
    });
  });

  it("База недоступна в карточке", async () => {
    await withUnreachableDb(async (db, owner) => {
      const failed = { ok: false, error: saveFailed };
      expect(await addContactToGroupCommand(db, owner, 1, 1)).toEqual(failed);
      expect(await removeContactFromGroupCommand(db, owner, 1, 1)).toEqual(
        failed,
      );
      expect(await addContactToNewGroupCommand(db, owner, 1, "Йога")).toEqual(
        failed,
      );
    });
  });

  it("Неверное название новой группы в карточке", async () => {
    await withRollback(async (db, owner) => {
      const anna = await addContact(db, owner, "Анна");
      expect(await addContactToNewGroupCommand(db, owner, anna, "  ")).toEqual({
        ok: false,
        error: "Укажите название группы",
      });
    });
  });
});
