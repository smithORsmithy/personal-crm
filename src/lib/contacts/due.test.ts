import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contactGroups, contacts, groups } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback } from "../../../test/db";
import { groupIdByName } from "../../../test/fixtures";

import { countDueContacts, selectDueContacts } from "./due";

const NOW = new Date("2026-11-06T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

// A contact with a weekly rhythm, added `daysAgo` days before NOW: the
// longer ago, the more overdue
async function addDueContact(
  db: Database,
  name: string,
  daysAgo: number,
  groupNames: string[],
) {
  const [contact] = await db
    .insert(contacts)
    .values({
      name,
      contactFrequency: "weekly",
      createdAt: new Date(NOW.getTime() - daysAgo * DAY),
    })
    .returning({ id: contacts.id });
  for (const groupName of groupNames) {
    await db.insert(contactGroups).values({
      contactId: contact.id,
      groupId: await groupIdByName(db, groupName),
    });
  }
}

// Анна (Друзья) and Ира (Друзья, Семья) are overdue, Олег (Теннис) less so
async function fill(db: Database) {
  await addDueContact(db, "Анна", 30, ["Друзья"]);
  await addDueContact(db, "Ира", 20, ["Друзья", "Семья"]);
  await addDueContact(db, "Олег", 10, ["Теннис"]);
}

const names = (list: { name: string }[]) => list.map((item) => item.name);

describe("Keep in touch: filter by group", () => {
  it("Только одна группа", async () => {
    await withRollback(async (db) => {
      await fill(db);
      const friends = await groupIdByName(db, "Друзья");
      const all = names(await selectDueContacts(db, NOW));
      const filtered = names(await selectDueContacts(db, NOW, friends));
      expect(all).toEqual(["Анна", "Ира", "Олег"]);
      // The same order as without the filter, Олег is gone
      expect(filtered).toEqual(all.filter((name) => name !== "Олег"));
      expect(filtered).toEqual(["Анна", "Ира"]);
    });
  });

  it("Снять фильтр", async () => {
    await withRollback(async (db) => {
      await fill(db);
      const list = await selectDueContacts(db, NOW, undefined);
      expect(names(list)).toEqual(["Анна", "Ира", "Олег"]);
    });
  });

  it("Из группы никому не пора написать", async () => {
    await withRollback(async (db) => {
      await fill(db);
      // Nobody is in "Знакомые"
      const list = await selectDueContacts(
        db,
        NOW,
        await groupIdByName(db, "Знакомые"),
      );
      expect(list).toEqual([]);
    });
  });

  it("Число на главной не зависит от фильтра", async () => {
    await withRollback(async (db) => {
      await fill(db);
      expect(await countDueContacts(db, NOW)).toBe(3);
    });
  });

  it("Удалённая группа ничего не показывает", async () => {
    await withRollback(async (db) => {
      await fill(db);
      const friends = await groupIdByName(db, "Друзья");
      await db.update(groups).set({ deletedAt: NOW }).where(eq(groups.id, friends));
      expect(await selectDueContacts(db, NOW, friends)).toEqual([]);
    });
  });
});
