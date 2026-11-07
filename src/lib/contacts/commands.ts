// "Как часто общаться" in the card: the step between a server action and
// the database. Checks the input, saves it and turns the outcome into texts
// for people. Knows nothing about Next.js, so tests run it on the real
// test database.

import { and, eq, isNull, sql } from "drizzle-orm";

import { logDbError } from "@/db/log-error";
import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

import { nearestDate, parseDayMonth, type RegularFrequency } from "./frequency";
import { contactFrequencySchema, parseId } from "./validation";

export type ContactFrequencyState = {
  error?: string;
};

export type ContactDateFormState = {
  // What was typed, so it stays in the field after an error
  input?: string;
  error?: string;
};

export const saveFailedMessage =
  "Не получилось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

export const contactGoneMessage = "Контакт не найден: возможно, его удалили";

const invalidDateMessage =
  "Проверьте дату: день и месяц через точку, например 16.12";

// One of the four frequencies, or null for "Не задано". The "Другое" date
// is cleared, so it is forgotten. The due time is not reset: it still
// counts from the last note.
export async function setContactFrequencyCommand(
  db: Database,
  contactId: number,
  frequency: RegularFrequency | null,
): Promise<ContactFrequencyState> {
  const id = parseId(contactId);
  if (!id) {
    return { error: "Контакт не найден" };
  }
  const parsed = contactFrequencySchema.safeParse(frequency);
  if (!parsed.success) {
    return { error: "Не получилось сохранить: такой частоты нет" };
  }

  try {
    const updated = await db
      .update(contacts)
      .set({
        contactFrequency: parsed.data,
        contactDate: null,
        contactDateSetAt: null,
      })
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return { error: contactGoneMessage };
    }
  } catch (error) {
    logDbError("Failed to set contact frequency", error);
    return { error: saveFailedMessage };
  }
  return {};
}

// "Другое": a day and month like "16.12". The year is the nearest such date
// from today; "today" comes from the database, the same clock the due rule
// compares with. Only notes written after now count.
export async function setContactDateCommand(
  db: Database,
  contactId: number,
  rawInput: unknown,
): Promise<ContactDateFormState> {
  const id = parseId(contactId);
  const input = typeof rawInput === "string" ? rawInput : "";
  if (!id) {
    return { input, error: "Контакт не найден" };
  }

  const dayMonth = parseDayMonth(input);
  if (!dayMonth) {
    return { input, error: invalidDateMessage };
  }

  try {
    // execute() gives untyped rows on the shared Database type
    const [{ today }] = (await db.execute(
      sql`select current_date::text as today`,
    )) as unknown as { today: string }[];
    const updated = await db
      .update(contacts)
      .set({
        contactFrequency: "on_date",
        contactDate: nearestDate(dayMonth, today),
        contactDateSetAt: sql`now()`,
      })
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return { input, error: contactGoneMessage };
    }
  } catch (error) {
    logDbError("Failed to set contact date", error);
    return { input, error: saveFailedMessage };
  }
  return {};
}
