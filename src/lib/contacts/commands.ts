// Adding a contact and "Как часто общаться" in the card: the step between
// a server action and the database. Checks the input, saves it and turns
// the outcome into texts for people. Knows nothing about Next.js, so tests
// run it on the real test database.

import { and, eq, isNull } from "drizzle-orm";

import { logDbError } from "@/db/log-error";
import { contacts } from "@/db/schema";
import type { Database } from "@/db/types";

import {
  parseContactForm,
  parseFrequencyChoice,
  readContactValues,
  type ContactField,
  type ContactFormValues,
} from "./form-values";
import {
  invalidDateMessage,
  parseDayMonth,
  type RegularFrequency,
} from "./frequency";
import { ownDateColumns } from "./own-date";
import { createContactWithGroups } from "./save";
import { contactFrequencySchema, parseId } from "./validation";

// The add and edit forms of a contact after a failed save
export type ContactFormState = {
  values?: ContactFormValues;
  errors?: Partial<Record<ContactField, string[]>>;
  message?: string;
  // The groups chosen in the form, so an error does not lose them
  groupIds?: number[];
  newGroups?: string[];
  // "Как часто общаться" in the add form: what was chosen and typed, and
  // the message under "День и месяц"
  frequency?: string;
  dayMonth?: string;
  dayMonthError?: string;
};

export type CreateContactResult =
  { ok: true; id: number } | { ok: false; state: ContactFormState };

// "Добавить контакт": the fields, the groups and "Как часто общаться" are
// checked together, so every message shows at once, and saved in one go.
// After an error everything chosen and typed comes back to the form.
export async function createContactCommand(
  db: Database,
  ownerId: string,
  formData: FormData,
): Promise<CreateContactResult> {
  const parsed = parseContactForm(formData);
  const frequency = parseFrequencyChoice(formData);
  const selection = { groupIds: parsed.groupIds, newGroups: parsed.newGroups };
  const kept = {
    ...selection,
    frequency: frequency.frequency,
    dayMonth: frequency.dayMonth,
  };

  if (!parsed.ok || !frequency.ok) {
    return {
      ok: false,
      state: {
        ...kept,
        values: readContactValues(formData),
        ...(parsed.ok ? {} : { errors: parsed.errors }),
        ...(frequency.ok ? {} : { dayMonthError: frequency.error }),
      },
    };
  }

  try {
    const id = await createContactWithGroups(
      db,
      ownerId,
      parsed.data,
      selection,
      frequency.choice,
    );
    return { ok: true, id };
  } catch (error) {
    logDbError("Failed to create contact", error);
    return { ok: false, state: saveFailedState(formData) };
  }
}

// The add form after the database failed: the message, and everything
// chosen and typed, so nothing has to be entered again. Also used when the
// database is down before the save starts and cannot tell who is signed in.
export function saveFailedState(formData: FormData): ContactFormState {
  const parsed = parseContactForm(formData);
  const frequency = parseFrequencyChoice(formData);
  return {
    values: readContactValues(formData),
    groupIds: parsed.groupIds,
    newGroups: parsed.newGroups,
    frequency: frequency.frequency,
    dayMonth: frequency.dayMonth,
    message: saveFailedMessage,
  };
}

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

// This user's contact that is not deleted. Someone else's contact is not
// found: the answer is the same as for a contact that does not exist.
function ownContact(ownerId: string, id: number) {
  return and(
    eq(contacts.id, id),
    eq(contacts.ownerId, ownerId),
    isNull(contacts.deletedAt),
  );
}

// One of the four frequencies, or null for "Не задано". The "Другое" date
// is cleared, so it is forgotten. The due time is not reset: it still
// counts from the last note.
export async function setContactFrequencyCommand(
  db: Database,
  ownerId: string,
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
      .where(ownContact(ownerId, id))
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
  ownerId: string,
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
    const updated = await db
      .update(contacts)
      .set(await ownDateColumns(db, dayMonth))
      .where(ownContact(ownerId, id))
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
