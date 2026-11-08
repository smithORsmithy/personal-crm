import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback, withUnreachableDb } from "../../../test/db";
import { addContact } from "../../../test/fixtures";

import { setContactDateCommand, setContactFrequencyCommand } from "./commands";
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
