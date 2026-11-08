// Everyone sees and changes only their own groups. For every function that
// reaches groups: someone else's group is answered like one that does not
// exist, and the data of its owner does not change.
// Two users: the owner (has the initial five groups) and a friend (has none).

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contactGroups, groups } from "@/db/schema";

import { withRollback } from "../../../test/db";
import {
  addContact,
  addGroup,
  addUser,
  groupIdByName,
} from "../../../test/fixtures";

import {
  addContactToGroupCommand,
  addContactToNewGroupCommand,
  createGroupCommand,
  deleteGroupCommand,
  groupGoneMessage,
  removeContactFromGroupCommand,
  renameGroupCommand,
  restoreGroupCommand,
} from "./commands";
import {
  findGroupByName,
  getRecentlyDeletedGroup,
  listContactGroups,
  listGroups,
} from "./store";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Группы другого пользователя не видны", () => {
  it("the page «Группы» and the field in the card show only own groups", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      await addGroup(db, a, "Йога");
      await addGroup(db, b, "Работа");
      const ownContact = await addContact(db, b, "Борис", ["Работа"]);
      const aliensContact = await addContact(db, a, "Анна", ["Йога"]);

      expect((await listGroups(db, b)).map((g) => g.name)).toEqual(["Работа"]);
      expect((await listGroups(db, a)).map((g) => g.name)).not.toContain(
        "Работа",
      );
      expect(
        (await listContactGroups(db, b, ownContact)).map((g) => g.name),
      ).toEqual(["Работа"]);
      // The groups of a contact that is not yours: nothing
      expect(await listContactGroups(db, b, aliensContact)).toEqual([]);
    });
  });

  it("a new user has no groups, and the counts count only own people", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      await addContact(db, a, "Анна", ["Теннис"]);

      expect(await listGroups(db, b)).toEqual([]);
      const tennis = (await listGroups(db, a)).find((g) => g.name === "Теннис");
      expect(tennis?.contactCount).toBe(1);
    });
  });

  it("finding a group by name looks only among own groups", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      expect(await findGroupByName(db, a, "теннис")).toMatchObject({
        name: "Теннис",
      });
      expect(await findGroupByName(db, b, "теннис")).toBeNull();
    });
  });
});

describe("Чужая группа как будто не существует", () => {
  it("renaming someone else's group says 'not found' and keeps the name", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const tennis = await groupIdByName(db, a, "Теннис");

      expect(await renameGroupCommand(db, b, tennis, "Корт")).toEqual({
        ok: false,
        error: groupGoneMessage,
        input: "Корт",
      });
      expect((await listGroups(db, a)).map((g) => g.name)).toContain("Теннис");
    });
  });

  it("deleting someone else's group deletes nothing and answers like for a group that is gone", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const tennis = await groupIdByName(db, a, "Теннис");

      expect(await deleteGroupCommand(db, b, tennis)).toEqual({
        ok: true,
        deleted: false,
      });
      expect((await listGroups(db, a)).map((g) => g.name)).toContain("Теннис");
    });
  });

  it("bringing back someone else's deleted group fails and brings nothing", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const tennis = await groupIdByName(db, a, "Теннис");
      await deleteGroupCommand(db, a, tennis);

      expect(await restoreGroupCommand(db, b, tennis)).toEqual({
        ok: false,
        error:
          "Не получилось вернуть: 5 секунд прошли, группа удалена насовсем.",
      });
      expect((await listGroups(db, a)).map((g) => g.name)).not.toContain(
        "Теннис",
      );
      expect(await restoreGroupCommand(db, a, tennis)).toEqual({ ok: true });
    });
  });

  it("the notice about a deleted group is shown only to its owner", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const tennis = await groupIdByName(db, a, "Теннис");
      await deleteGroupCommand(db, a, tennis);

      expect((await getRecentlyDeletedGroup(db, a, tennis))?.name).toBe(
        "Теннис",
      );
      expect(await getRecentlyDeletedGroup(db, b, tennis)).toBeNull();
    });
  });

  it("adding a contact to someone else's group, or someone else's contact to own group, is refused", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const ownGroup = await addGroup(db, b, "Работа");
      const ownContact = await addContact(db, b, "Борис");
      const aliensContact = await addContact(db, a, "Анна");
      const aliensGroup = await groupIdByName(db, a, "Теннис");

      expect(
        await addContactToGroupCommand(db, b, ownContact, aliensGroup),
      ).toEqual({ ok: false, error: groupGoneMessage });
      expect(
        await addContactToGroupCommand(db, b, aliensContact, ownGroup),
      ).toEqual({
        ok: false,
        error: "Контакт не найден: возможно, его удалили",
      });
      expect(await db.select().from(contactGroups)).toEqual([]);
    });
  });

  it("removing someone else's contact from a group changes nothing", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const aliensContact = await addContact(db, a, "Анна", ["Теннис"]);
      const tennis = await groupIdByName(db, a, "Теннис");

      const result = await removeContactFromGroupCommand(
        db,
        b,
        aliensContact,
        tennis,
      );

      expect(result.ok).toBe(false);
      expect(
        (await listContactGroups(db, a, aliensContact)).map((g) => g.name),
      ).toEqual(["Теннис"]);
    });
  });

  it("«Создать группу» in the card of someone else's contact creates no group", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const aliensContact = await addContact(db, a, "Анна");

      expect(
        await addContactToNewGroupCommand(db, b, aliensContact, "Йога"),
      ).toEqual({
        ok: false,
        error: "Контакт не найден: возможно, его удалили",
      });
      expect(await listGroups(db, b)).toEqual([]);
      expect(
        await db
          .select()
          .from(groups)
          .where(and(eq(groups.name, "Йога"))),
      ).toEqual([]);
    });
  });

  it("«Создать группу» in the card makes the group of the user, found by name among own groups", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const contact = await addContact(db, b, "Борис");

      expect(await addContactToNewGroupCommand(db, b, contact, "Йога")).toEqual(
        {
          ok: true,
        },
      );

      const [yoga] = await db
        .select({ ownerId: groups.ownerId })
        .from(groups)
        .where(eq(groups.name, "Йога"));
      expect(yoga.ownerId).toBe(b);
      expect((await listGroups(db, a)).map((g) => g.name)).not.toContain(
        "Йога",
      );
    });
  });

  it("a group made by a user belongs to them", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const result = await createGroupCommand(db, b, "Работа");
      expect(result.ok).toBe(true);
      expect((await listGroups(db, b)).map((g) => g.name)).toEqual(["Работа"]);
      expect((await listGroups(db, a)).map((g) => g.name)).not.toContain(
        "Работа",
      );
    });
  });
});

describe("Такая же группа у другого пользователя", () => {
  it("B gets a group of his own with the same name; the groups and people of A stay", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      await addContact(db, a, "Анна", ["Друзья"]);

      const result = await createGroupCommand(db, b, "Друзья");

      expect(result.ok).toBe(true);
      const own = (await listGroups(db, b)).find((g) => g.name === "Друзья");
      expect(own?.contactCount).toBe(0);
      const aliens = (await listGroups(db, a)).find((g) => g.name === "Друзья");
      expect(aliens?.contactCount).toBe(1);
      expect(own?.id).not.toBe(aliens?.id);
    });
  });

  it("Такая группа уже есть: still refused for one user, capitals ignored", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      await createGroupCommand(db, b, "Друзья");

      expect(await createGroupCommand(db, b, "друзья")).toEqual({
        ok: false,
        error: "Группа «Друзья» уже есть",
        input: "друзья",
      });
      // And renaming into a name the user has is refused as well
      const work = await createGroupCommand(db, b, "Работа");
      if (!work.ok) throw new Error("must be created");
      expect(await renameGroupCommand(db, b, work.group.id, "ДРУЗЬЯ")).toEqual({
        ok: false,
        error: "Группа «Друзья» уже есть",
        input: "ДРУЗЬЯ",
      });
      expect((await listGroups(db, a)).map((g) => g.name)).toContain("Друзья");
    });
  });

  it("the same name taken by another user does not block «Отменить»", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const tennis = await groupIdByName(db, a, "Теннис");
      await deleteGroupCommand(db, a, tennis);
      await createGroupCommand(db, b, "Теннис");

      expect(await restoreGroupCommand(db, a, tennis)).toEqual({ ok: true });
    });
  });
});
