// Everyone sees and changes only their own contacts. For every function
// that reaches contacts: someone else's contact is answered like one that
// does not exist, and the data of its owner does not change.
// Two users: the owner (has the initial five groups) and a friend (has none).

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contactGroups, contacts, groups, notes } from "@/db/schema";
import type { Database } from "@/db/types";
import { setContactGroups } from "@/lib/groups/store";

import { withRollback } from "../../../test/db";
import { addContact, addGroup, addUser } from "../../../test/fixtures";

import {
  contactGoneMessage,
  setContactDateCommand,
  setContactFrequencyCommand,
} from "./commands";
import { selectContactList } from "./list";
import {
  addNoteCommand,
  deleteContactCommand,
  restoreContactCommand,
} from "./manage";
import { getContact, getRecentlyDeletedContact, listNotes } from "./read";
import { createContactWithGroups, updateContactWithGroups } from "./save";
import {
  countDueContacts,
  hasContactsWithFrequency,
  selectDueContacts,
} from "./due";

const person = (name: string) => ({
  name,
  about: null,
  howWeMet: null,
  phone: null,
  email: null,
});

async function rowOf(db: Database, id: number) {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
  return row;
}

describe("Контакт A не виден B", () => {
  it("the list of B has none of the contacts of A, and the list of A has them", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      await addContact(db, a, "Глеб Соколов");
      await addContact(db, b, "Борис Орлов");

      expect((await selectContactList(db, a)).map((c) => c.name)).toEqual([
        "Глеб Соколов",
      ]);
      expect((await selectContactList(db, b)).map((c) => c.name)).toEqual([
        "Борис Орлов",
      ]);
    });
  });

  it("a new user has an empty list", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      await addContact(db, a, "Глеб Соколов");
      expect(await selectContactList(db, b)).toEqual([]);
    });
  });

  it("groups in the labels of a row are the groups of its owner", async () => {
    await withRollback(async (db, a) => {
      const id = await addContact(db, a, "Глеб Соколов", ["Теннис"]);
      const [row] = await selectContactList(db, a);
      expect(row.groupIds).toHaveLength(1);
      expect(await rowOf(db, id)).toMatchObject({ ownerId: a });
    });
  });
});

describe("Прямая ссылка на чужой контакт", () => {
  it("the card, the notes and the edit page are 'not found' for B", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");
      await db.insert(notes).values({ contactId: id, body: "Созвонились" });

      expect((await getContact(db, a, id))?.name).toBe("Глеб Соколов");
      expect(await getContact(db, b, id)).toBeNull();
      expect(await listNotes(db, a, id)).toHaveLength(1);
      expect(await listNotes(db, b, id)).toEqual([]);
    });
  });
});

describe("Сообщение об удалении чужого контакта", () => {
  it("B gets nothing, A gets the notice with the name", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");
      await deleteContactCommand(db, a, id);

      expect((await getRecentlyDeletedContact(db, a, id))?.name).toBe(
        "Глеб Соколов",
      );
      expect(await getRecentlyDeletedContact(db, b, id)).toBeNull();
    });
  });
});

describe("Создание и изменение", () => {
  it("a new contact belongs to the user who creates it", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await createContactWithGroups(db, b, person("Борис"), {
        groupIds: [],
        newGroups: [],
      });
      expect(await rowOf(db, id)).toMatchObject({ ownerId: b });
      expect(await selectContactList(db, a)).toEqual([]);
    });
  });

  it("changing someone else's contact says false and changes nothing", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов", ["Друзья"]);
      const before = await rowOf(db, id);

      const saved = await updateContactWithGroups(
        db,
        b,
        id,
        { ...person("Взломанный"), phone: "+7 900 000-00-00" },
        { groupIds: [], newGroups: ["Чужая"] },
      );

      expect(saved).toBe(false);
      expect(await rowOf(db, id)).toEqual(before);
      // Not a single group appeared for the friend, and the links stayed
      expect(
        await db.select().from(groups).where(eq(groups.ownerId, b)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(contactGroups)
          .where(eq(contactGroups.contactId, id)),
      ).toHaveLength(1);
    });
  });

  it("numbers of someone else's groups in the form are not added", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const alienGroup = await addGroup(db, a, "Йога");
      const own = await addGroup(db, b, "Работа");
      const id = await createContactWithGroups(db, b, person("Борис"), {
        groupIds: [alienGroup, own],
        newGroups: [],
      });

      const links = await db
        .select({ groupId: contactGroups.groupId })
        .from(contactGroups)
        .where(eq(contactGroups.contactId, id));
      expect(links).toEqual([{ groupId: own }]);
    });
  });

  it("a name typed into the groups field creates the group of the user, not of someone else", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, b, "Борис");

      await setContactGroups(db, b, id, { groupIds: [], newGroups: ["Йога"] });

      const created = await db
        .select({ ownerId: groups.ownerId })
        .from(groups)
        .where(eq(groups.name, "Йога"));
      expect(created).toEqual([{ ownerId: b }]);
      expect(
        await db
          .select()
          .from(groups)
          .where(and(eq(groups.ownerId, a), eq(groups.name, "Йога"))),
      ).toEqual([]);
    });
  });
});

describe("Старая вкладка после смены пользователя", () => {
  it("a note for someone else's contact is refused and not saved", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");

      expect(await addNoteCommand(db, b, id, "Взломанная заметка")).toEqual({
        body: "Взломанная заметка",
        error: contactGoneMessage,
      });
      expect(await listNotes(db, a, id)).toEqual([]);

      expect(await addNoteCommand(db, a, id, "Своя заметка")).toEqual({});
      expect((await listNotes(db, a, id)).map((n) => n.body)).toEqual([
        "Своя заметка",
      ]);
    });
  });

  it("deleting someone else's contact opens the list like for a contact that is gone, and deletes nothing", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");

      expect(await deleteContactCommand(db, b, id)).toEqual({
        ok: true,
        deleted: false,
      });
      expect((await rowOf(db, id)).deletedAt).toBeNull();
      expect((await selectContactList(db, a)).map((c) => c.name)).toEqual([
        "Глеб Соколов",
      ]);
    });
  });

  it("bringing back someone else's deleted contact fails and brings nothing", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");
      await deleteContactCommand(db, a, id);

      expect(await restoreContactCommand(db, b, id)).toEqual({
        ok: false,
        error:
          "Не получилось вернуть: 5 секунд прошли, контакт удалён насовсем.",
      });
      expect((await rowOf(db, id)).deletedAt).not.toBeNull();

      expect(await restoreContactCommand(db, a, id)).toEqual({
        ok: true,
        id,
      });
      expect((await rowOf(db, id)).deletedAt).toBeNull();
    });
  });
});

describe("Частота и своя дата чужого контакта", () => {
  it("the frequency of someone else's contact says 'not found' and stays", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");
      await setContactFrequencyCommand(db, a, id, "monthly");

      expect(await setContactFrequencyCommand(db, b, id, "weekly")).toEqual({
        error: contactGoneMessage,
      });
      expect((await rowOf(db, id)).contactFrequency).toBe("monthly");
    });
  });

  it("the own date of someone else's contact says 'not found' and stays", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Глеб Соколов");
      await setContactFrequencyCommand(db, a, id, "monthly");

      expect(await setContactDateCommand(db, b, id, "16.12")).toEqual({
        input: "16.12",
        error: contactGoneMessage,
      });
      const after = await rowOf(db, id);
      expect(after.contactFrequency).toBe("monthly");
      expect(after.contactDate).toBeNull();
    });
  });
});

describe('"Пора связаться" считает только своих', () => {
  it("the page, the number and the 'has a frequency' check see only their own", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const first = await addContact(db, a, "Анна");
      const second = await addContact(db, a, "Олег");
      for (const id of [first, second]) {
        await db
          .update(contacts)
          .set({
            contactFrequency: "weekly",
            createdAt: new Date("2020-01-01T12:00:00Z"),
          })
          .where(eq(contacts.id, id));
      }
      const own = await addContact(db, b, "Борис");
      await db
        .update(contacts)
        .set({ contactFrequency: null })
        .where(eq(contacts.id, own));

      expect((await selectDueContacts(db, a)).map((c) => c.name)).toEqual([
        "Анна",
        "Олег",
      ]);
      expect(await countDueContacts(db, a)).toBe(2);
      expect(await hasContactsWithFrequency(db, a)).toBe(true);

      expect(await selectDueContacts(db, b)).toEqual([]);
      expect(await countDueContacts(db, b)).toBe(0);
      expect(await hasContactsWithFrequency(db, b)).toBe(false);
    });
  });

  it("a group of someone else filters nothing in", async () => {
    await withRollback(async (db, a) => {
      const b = await addUser(db, "boris@example.test");
      const id = await addContact(db, a, "Анна", ["Друзья"]);
      await db
        .update(contacts)
        .set({
          contactFrequency: "weekly",
          createdAt: new Date("2020-01-01T12:00:00Z"),
        })
        .where(eq(contacts.id, id));
      const [friends] = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.ownerId, a), eq(groups.name, "Друзья")));

      expect(await selectDueContacts(db, b, undefined, friends.id)).toEqual([]);
      expect(
        (await selectDueContacts(db, a, undefined, friends.id)).map(
          (c) => c.name,
        ),
      ).toEqual(["Анна"]);
    });
  });
});
