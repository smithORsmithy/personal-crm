import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback } from "../../../test/db";
import { addContact } from "../../../test/fixtures";

import { setContactDateCommand, setContactFrequencyCommand } from "./commands";
import { parseContactForm, parseFrequencyChoice } from "./form-values";
import { frequencyDisplay, nearestDate } from "./frequency";
import { createContactWithGroups, updateContactWithGroups } from "./save";

async function savedChoice(db: Database, id: number) {
  const [row] = await db
    .select({
      frequency: contacts.contactFrequency,
      contactDate: contacts.contactDate,
      contactDateSetAt: contacts.contactDateSetAt,
    })
    .from(contacts)
    .where(eq(contacts.id, id));
  return row;
}

async function shownInCard(db: Database, id: number): Promise<string> {
  const row = await savedChoice(db, id);
  return frequencyDisplay(row.frequency, row.contactDate);
}

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return formData;
}

// What the add and edit forms send: the contact's fields
function parseForm(fields: Record<string, string>) {
  const parsed = parseContactForm(formOf(fields));
  if (!parsed.ok) {
    throw new Error("The test form must be valid");
  }
  return parsed;
}

// "Добавить контакт", the way the add action saves it: the contact's
// fields, its groups and "Как часто общаться"
async function saveAddForm(
  db: Database,
  owner: string,
  fields: Record<string, string>,
): Promise<number> {
  const parsed = parseForm(fields);
  const frequency = parseFrequencyChoice(formOf(fields));
  if (!frequency.ok) {
    throw new Error("The test date must be valid");
  }
  return createContactWithGroups(
    db,
    owner,
    parsed.data,
    { groupIds: parsed.groupIds, newGroups: parsed.newGroups },
    frequency.choice,
  );
}

// "Изменить" → "Сохранить", the way the edit action saves it
async function saveEditForm(
  db: Database,
  owner: string,
  id: number,
  fields: Record<string, string>,
) {
  const parsed = parseForm(fields);
  const saved = await updateContactWithGroups(db, owner, id, parsed.data, {
    groupIds: parsed.groupIds,
    newGroups: parsed.newGroups,
  });
  expect(saved).toBe(true);
}

describe("No frequency until it is chosen", () => {
  it("Новый контакт без частоты", async () => {
    await withRollback(async (db, owner) => {
      // The field was not touched: the list sends "Не задано"
      const id = await saveAddForm(db, owner, {
        name: "Глеб Соколов",
        phone: "+7 900 1",
        frequency: "none",
      });
      expect(await shownInCard(db, id)).toBe("Не задано");
    });
  });

  it("форма «Изменить» не меняет частоту, даже если браузер её прислал", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactFrequencyCommand(db, owner, id, "quarterly");
      await saveEditForm(db, owner, id, {
        name: "Анна",
        frequency: "on_date",
        dayMonth: "16.12",
      });
      expect(await shownInCard(db, id)).toBe("Раз в квартал");
    });
  });

  it("Изменение данных контакта не сбрасывает частоту", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactFrequencyCommand(db, owner, id, "quarterly");
      await saveEditForm(db, owner, id, {
        name: "Анна",
        phone: "+7 900 123-45-67",
      });
      expect(await shownInCard(db, id)).toBe("Раз в квартал");
    });
  });

  it("Изменение данных контакта не сбрасывает свою дату", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactDateCommand(db, owner, id, "16.12");
      const before = await savedChoice(db, id);
      await saveEditForm(db, owner, id, {
        name: "Анна",
        email: "anna@example.com",
      });
      expect(await shownInCard(db, id)).toBe("Другое: 16.12");
      // Even the moment the date was set stays: notes still count from it
      expect(await savedChoice(db, id)).toEqual(before);
    });
  });

  it("Контакты, которые были до этой фичи", async () => {
    await withRollback(async (db, owner) => {
      // Written the way the app wrote contacts before: no frequency fields
      const [{ id }] = (await db.execute(
        sql`insert into contacts (owner_id, name) values (${owner}, 'Старый знакомый') returning id`,
      )) as unknown as { id: number }[];
      expect(await shownInCard(db, id)).toBe("Не задано");
    });
  });
});

describe("Frequency in the add form", () => {
  async function databaseToday(db: Database): Promise<string> {
    const [{ today }] = (await db.execute(
      sql`select current_date::text as today`,
    )) as unknown as { today: string }[];
    return today;
  }

  async function addedAt(db: Database, id: number): Promise<Date> {
    const [row] = await db
      .select({ createdAt: contacts.createdAt })
      .from(contacts)
      .where(eq(contacts.id, id));
    return row.createdAt;
  }

  it("Новый контакт с частотой", async () => {
    await withRollback(async (db, owner) => {
      const id = await saveAddForm(db, owner, {
        name: "Вера",
        frequency: "monthly",
      });
      expect(await shownInCard(db, id)).toBe("Раз в месяц");
      expect(await savedChoice(db, id)).toEqual({
        frequency: "monthly",
        contactDate: null,
        contactDateSetAt: null,
      });
    });
  });

  it("Новый контакт со своей датой", async () => {
    await withRollback(async (db, owner) => {
      const id = await saveAddForm(db, owner, {
        name: "Вера",
        frequency: "on_date",
        dayMonth: "16.12",
      });
      expect(await shownInCard(db, id)).toBe("Другое: 16.12");

      // The year is picked as in the card: the nearest such date
      const saved = await savedChoice(db, id);
      expect(saved.frequency).toBe("on_date");
      expect(saved.contactDate).toBe(
        nearestDate({ day: 16, month: 12 }, await databaseToday(db)),
      );
      // The date counts as set the moment the contact was added
      expect(saved.contactDateSetAt).toEqual(await addedAt(db, id));
    });
  });

  it("Передумать со своей датой", async () => {
    await withRollback(async (db, owner) => {
      const id = await saveAddForm(db, owner, {
        name: "Вера",
        frequency: "yearly",
        dayMonth: "16.12",
      });
      expect(await shownInCard(db, id)).toBe("Раз в год");
      expect((await savedChoice(db, id)).contactDate).toBeNull();
    });
  });
});
