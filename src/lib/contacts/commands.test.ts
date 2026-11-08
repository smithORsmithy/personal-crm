import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback, withUnreachableDb } from "../../../test/db";
import { addContact } from "../../../test/fixtures";

import {
  createContactCommand,
  saveFailedState,
  setContactDateCommand,
  setContactFrequencyCommand,
} from "./commands";
import { frequencyDisplay, nearestDate, parseDayMonth } from "./frequency";

const saveFailed =
  "Не получилось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const invalidDate = "Проверьте дату: день и месяц через точку, например 16.12";

// A failed database call is logged on purpose; keep the test output clean
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

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

// The frequency field of the card, read from the database again: what a
// reload or another browser shows
async function shownInCard(db: Database, id: number): Promise<string> {
  const row = await savedChoice(db, id);
  return frequencyDisplay(row.frequency, row.contactDate);
}

async function databaseToday(db: Database): Promise<string> {
  const [{ today }] = (await db.execute(
    sql`select current_date::text as today`,
  )) as unknown as { today: string }[];
  return today;
}

describe("Frequency in the card", () => {
  it("Задать частоту", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      expect(
        await setContactFrequencyCommand(db, owner, id, "monthly"),
      ).toEqual({});
      expect(await shownInCard(db, id)).toBe("Раз в месяц");
    });
  });

  it("Поменять частоту", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactFrequencyCommand(db, owner, id, "monthly");
      expect(await setContactFrequencyCommand(db, owner, id, "yearly")).toEqual(
        {},
      );
      expect(await shownInCard(db, id)).toBe("Раз в год");
    });
  });

  it("Убрать частоту", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactFrequencyCommand(db, owner, id, "weekly");
      expect(await setContactFrequencyCommand(db, owner, id, null)).toEqual({});
      expect((await savedChoice(db, id)).frequency).toBeNull();
      expect(await shownInCard(db, id)).toBe("Не задано");
    });
  });
});

describe("Own date through «Другое»", () => {
  it("Задать свою дату", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      expect(await setContactDateCommand(db, owner, id, "16.12")).toEqual({});
      expect(await shownInCard(db, id)).toBe("Другое: 16.12");

      // The year is the nearest such date by the database clock, and the
      // moment it was set is kept: only notes after it count
      const saved = await savedChoice(db, id);
      expect(saved.contactDate).toBe(
        nearestDate(parseDayMonth("16.12")!, await databaseToday(db)),
      );
      expect(saved.contactDateSetAt).toBeInstanceOf(Date);
    });
  });

  it("Поменять свою дату", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactDateCommand(db, owner, id, "16.12");
      expect(await setContactDateCommand(db, owner, id, "20.12")).toEqual({});
      expect(await shownInCard(db, id)).toBe("Другое: 20.12");
    });
  });

  it("Сменить свою дату на частоту", async () => {
    await withRollback(async (db, owner) => {
      const id = await addContact(db, owner, "Анна");
      await setContactDateCommand(db, owner, id, "16.12");
      expect(
        await setContactFrequencyCommand(db, owner, id, "monthly"),
      ).toEqual({});
      expect(await shownInCard(db, id)).toBe("Раз в месяц");

      // The date is forgotten, so "Другое…" opens an empty dialog
      const saved = await savedChoice(db, id);
      expect(saved.contactDate).toBeNull();
      expect(saved.contactDateSetAt).toBeNull();
    });
  });
});

describe("Wrong own date", () => {
  for (const [scenario, inputs] of [
    ["Такой даты не бывает", ["31.02", "16.13"]],
    ["Не дата", ["завтра", "16,12", ""]],
  ] as const) {
    it(scenario, async () => {
      await withRollback(async (db, owner) => {
        const id = await addContact(db, owner, "Анна");
        await setContactFrequencyCommand(db, owner, id, "monthly");
        for (const input of inputs) {
          // The typed text comes back, so it stays in the field
          expect(await setContactDateCommand(db, owner, id, input)).toEqual({
            input,
            error: invalidDate,
          });
          expect(await shownInCard(db, id)).toBe("Раз в месяц");
        }
      });
    });
  }
});

describe("Saving fails", () => {
  it("База данных недоступна при выборе частоты", async () => {
    await withUnreachableDb(async (db, owner) => {
      expect(await setContactFrequencyCommand(db, owner, 1, "weekly")).toEqual({
        error: saveFailed,
      });
    });
  });

  it("База данных недоступна при сохранении своей даты", async () => {
    await withUnreachableDb(async (db, owner) => {
      expect(await setContactDateCommand(db, owner, 1, "16.12")).toEqual({
        input: "16.12",
        error: saveFailed,
      });
    });
  });
});

// "Добавить контакт": the contact's fields, its groups and "Как часто
// общаться" checked together and saved in one go
describe("Adding a contact with a frequency", () => {
  function formOf(fields: [string, string][]): FormData {
    const formData = new FormData();
    for (const [key, value] of fields) {
      formData.append(key, value);
    }
    return formData;
  }

  async function namesOf(db: Database, owner: string): Promise<string[]> {
    const rows = await db
      .select({ name: contacts.name })
      .from(contacts)
      .where(eq(contacts.ownerId, owner));
    return rows.map((row) => row.name);
  }

  it("добавление с частотой возвращает номер нового контакта", async () => {
    await withRollback(async (db, owner) => {
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", "Вера"],
          ["frequency", "monthly"],
        ]),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(await shownInCard(db, result.id)).toBe("Раз в месяц");
      }
    });
  });

  it("Такой даты не бывает в форме", async () => {
    await withRollback(async (db, owner) => {
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", "Вера"],
          ["frequency", "on_date"],
          ["dayMonth", "31.02"],
        ]),
      );
      expect(result).toMatchObject({
        ok: false,
        state: {
          values: { name: "Вера" },
          frequency: "on_date",
          dayMonth: "31.02",
          dayMonthError: invalidDate,
        },
      });
      expect(await namesOf(db, owner)).not.toContain("Вера");
    });
  });

  it("Не дата в форме", async () => {
    await withRollback(async (db, owner) => {
      for (const dayMonth of ["завтра", "16,12", ""]) {
        const result = await createContactCommand(
          db,
          owner,
          formOf([
            ["name", "Вера"],
            ["frequency", "on_date"],
            ["dayMonth", dayMonth],
          ]),
        );
        expect(result).toMatchObject({
          ok: false,
          state: { dayMonth, dayMonthError: invalidDate },
        });
      }
      expect(await namesOf(db, owner)).not.toContain("Вера");
    });
  });

  it("Неверная дата и пустое имя", async () => {
    await withRollback(async (db, owner) => {
      const before = await namesOf(db, owner);
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", "   "],
          ["frequency", "on_date"],
          ["dayMonth", "31.02"],
        ]),
      );
      // Both messages at once, each under its own field
      expect(result).toMatchObject({
        ok: false,
        state: {
          errors: { name: ["Укажите имя"] },
          dayMonthError: invalidDate,
        },
      });
      expect(await namesOf(db, owner)).toEqual(before);
    });
  });

  it("Ошибка в имени не сбрасывает частоту", async () => {
    await withRollback(async (db, owner) => {
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", "   "],
          ["frequency", "quarterly"],
        ]),
      );
      expect(result).toMatchObject({
        ok: false,
        state: { errors: { name: ["Укажите имя"] }, frequency: "quarterly" },
      });
      if (!result.ok) {
        expect(result.state.dayMonthError).toBeUndefined();
      }
    });
  });

  it("Ошибка в имени не сбрасывает свою дату", async () => {
    await withRollback(async (db, owner) => {
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", "   "],
          ["frequency", "on_date"],
          ["dayMonth", "16.12"],
        ]),
      );
      expect(result).toMatchObject({
        ok: false,
        state: {
          errors: { name: ["Укажите имя"] },
          frequency: "on_date",
          dayMonth: "16.12",
        },
      });
      if (!result.ok) {
        expect(result.state.dayMonthError).toBeUndefined();
      }
    });
  });

  // Moved here from the action: the groups still come back after an error
  it("Ошибка в форме не сбрасывает группы", async () => {
    await withRollback(async (db, owner) => {
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", ""],
          ["groupId", "4"],
          ["newGroup", "Йога"],
          ["frequency", "weekly"],
        ]),
      );
      expect(result).toMatchObject({
        ok: false,
        state: { groupIds: [4], newGroups: ["Йога"], frequency: "weekly" },
      });
    });
  });

  it("База данных недоступна при добавлении контакта с частотой", async () => {
    await withUnreachableDb(async (db, owner) => {
      const result = await createContactCommand(
        db,
        owner,
        formOf([
          ["name", "Вера"],
          ["frequency", "monthly"],
        ]),
      );
      expect(result).toMatchObject({
        ok: false,
        state: {
          message: saveFailed,
          values: { name: "Вера" },
          frequency: "monthly",
        },
      });
    });
  });
});

// The database is down before the save even starts: who is signed in
// cannot be checked (src/lib/auth/session-check.ts). The form still gets
// the message and everything chosen and typed.
describe("Adding a contact while sign-in cannot be checked", () => {
  it("База данных недоступна при добавлении контакта с частотой: всё введённое остаётся", () => {
    const formData = new FormData();
    for (const [key, value] of [
      ["name", "Вера"],
      ["phone", "+7 900 1"],
      ["groupId", "4"],
      ["newGroup", "Йога"],
      ["frequency", "on_date"],
      ["dayMonth", "16.12"],
    ]) {
      formData.append(key, value);
    }
    expect(saveFailedState(formData)).toMatchObject({
      message: saveFailed,
      values: { name: "Вера", phone: "+7 900 1" },
      groupIds: [4],
      newGroups: ["Йога"],
      frequency: "on_date",
      dayMonth: "16.12",
    });
  });
});
