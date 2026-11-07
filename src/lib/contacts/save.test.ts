import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback } from "../../../test/db";
import { addContact } from "../../../test/fixtures";

import { setContactDateCommand, setContactFrequencyCommand } from "./commands";
import { parseContactForm } from "./form-values";
import { frequencyDisplay } from "./frequency";
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

// What the add and edit forms send: only the contact's fields
function parseForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  const parsed = parseContactForm(formData);
  if (!parsed.ok) {
    throw new Error("The test form must be valid");
  }
  return parsed;
}

// "Изменить" → "Сохранить", the way the edit action saves it
async function saveEditForm(
  db: Database,
  id: number,
  fields: Record<string, string>,
) {
  const parsed = parseForm(fields);
  const saved = await updateContactWithGroups(db, id, parsed.data, {
    groupIds: parsed.groupIds,
    newGroups: parsed.newGroups,
  });
  expect(saved).toBe(true);
}

describe("No frequency until it is chosen", () => {
  it("Новый контакт без частоты", async () => {
    await withRollback(async (db) => {
      const parsed = parseForm({ name: "Глеб Соколов", phone: "+7 900 1" });
      const id = await createContactWithGroups(db, parsed.data, {
        groupIds: [],
        newGroups: [],
      });
      expect(await shownInCard(db, id)).toBe("Не задано");
    });
  });

  it("Изменение данных контакта не сбрасывает частоту", async () => {
    await withRollback(async (db) => {
      const id = await addContact(db, "Анна");
      await setContactFrequencyCommand(db, id, "quarterly");
      await saveEditForm(db, id, { name: "Анна", phone: "+7 900 123-45-67" });
      expect(await shownInCard(db, id)).toBe("Раз в квартал");
    });
  });

  it("Изменение данных контакта не сбрасывает свою дату", async () => {
    await withRollback(async (db) => {
      const id = await addContact(db, "Анна");
      await setContactDateCommand(db, id, "16.12");
      const before = await savedChoice(db, id);
      await saveEditForm(db, id, { name: "Анна", email: "anna@example.com" });
      expect(await shownInCard(db, id)).toBe("Другое: 16.12");
      // Even the moment the date was set stays: notes still count from it
      expect(await savedChoice(db, id)).toEqual(before);
    });
  });

  it("Контакты, которые были до этой фичи", async () => {
    await withRollback(async (db) => {
      // Written the way the app wrote contacts before: no frequency fields
      const [{ id }] = (await db.execute(
        sql`insert into contacts (name) values ('Старый знакомый') returning id`,
      )) as unknown as { id: number }[];
      expect(await shownInCard(db, id)).toBe("Не задано");
    });
  });
});
