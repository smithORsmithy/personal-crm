"use server";

import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";

import { getDb } from "@/db";
import { logDbError } from "@/db/log-error";
import { contacts, notes } from "@/db/schema";

import {
  parseContactForm,
  readContactValues,
  type ContactField,
  type ContactFormValues,
} from "./form-values";
import {
  nearestDate,
  parseDayMonth,
  type RegularFrequency,
} from "./frequency";
import { KEEP_DELETED_SECONDS, UNDO_SECONDS } from "@/lib/undo-window";
import { createContactWithGroups, updateContactWithGroups } from "./save";
import {
  contactFrequencySchema,
  noteSchema,
  parseId,
} from "./validation";

export type ContactFormState = {
  values?: ContactFormValues;
  errors?: Partial<Record<ContactField, string[]>>;
  message?: string;
  // The groups chosen in the form, so an error does not lose them
  groupIds?: number[];
  newGroups?: string[];
};

export type NoteFormState = {
  body?: string;
  error?: string;
  savedAt?: number;
};

export type DeleteContactState = {
  error?: string;
};

export type RestoreContactState = {
  error?: string;
};

export type ContactFrequencyState = {
  error?: string;
};

export type ContactDateFormState = {
  // What was typed, so it stays in the field after an error
  input?: string;
  error?: string;
};

const saveFailedMessage =
  "Не получилось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

const contactGoneMessage = "Контакт не найден: возможно, его удалили";

const invalidDateMessage =
  "Проверьте дату: день и месяц через точку, например 16.12";

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = parseContactForm(formData);
  const selection = { groupIds: parsed.groupIds, newGroups: parsed.newGroups };
  if (!parsed.ok) {
    return { ...selection, values: parsed.values, errors: parsed.errors };
  }

  let id: number;
  try {
    id = await createContactWithGroups(getDb(), parsed.data, selection);
  } catch (error) {
    logDbError("Failed to create contact", error);
    return {
      ...selection,
      values: readContactValues(formData),
      message: saveFailedMessage,
    };
  }

  revalidatePath("/", "layout");
  redirect(`/?added=${id}`);
}

export async function updateContact(
  contactId: number,
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const id = parseId(contactId);
  const values = readContactValues(formData);
  if (!id) {
    return { values, message: "Контакт не найден" };
  }

  const parsed = parseContactForm(formData);
  const selection = { groupIds: parsed.groupIds, newGroups: parsed.newGroups };
  if (!parsed.ok) {
    return { ...selection, values: parsed.values, errors: parsed.errors };
  }

  try {
    const saved = await updateContactWithGroups(
      getDb(),
      id,
      parsed.data,
      selection,
    );
    if (!saved) {
      return { ...selection, values, message: contactGoneMessage };
    }
  } catch (error) {
    logDbError("Failed to update contact", error);
    return { ...selection, values, message: saveFailedMessage };
  }

  revalidatePath("/", "layout");
  redirect(`/contacts/${id}`);
}

// Deleted contacts older than the undo window: the database clock decides
const pastUndoWindow = sql`now() - interval '1 second' * ${KEEP_DELETED_SECONDS}`;

// Deleting only marks the contact: for a few seconds "Отменить" can bring it
// back. Then it is erased for good, and its notes go with it
// (notes.contact_id is ON DELETE CASCADE).
// Used with useActionState, which also passes the previous state: not needed here
export async function deleteContact(
  contactId: number,
): Promise<DeleteContactState> {
  const id = parseId(contactId);
  if (!id) {
    return { error: "Контакт не найден" };
  }

  let deleted: { id: number } | undefined;
  try {
    [deleted] = await getDb()
      .update(contacts)
      // updated_at is the time of the last edit of the contact's data:
      // deleting and restoring do not change it
      .set({ deletedAt: sql`now()`, updatedAt: sql`${contacts.updatedAt}` })
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id });
  } catch (error) {
    logDbError("Failed to delete contact", error);
    return {
      error:
        "Не получилось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.",
    };
  }

  if (deleted) {
    // Runs after the response is sent; on shutdown the server waits for it.
    // It erases every contact past the undo window, so one that was missed
    // (the server crashed) is erased by the next deletion.
    after(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, KEEP_DELETED_SECONDS * 1000 + 500),
      );
      await eraseDeletedContacts();
    });
  }

  revalidatePath("/", "layout");
  // Already deleted in another browser: nothing to report, just open the list.
  // Replace, not push: Back must not lead to the card that is gone.
  redirect(deleted ? `/?deleted=${deleted.id}` : "/", RedirectType.replace);
}

// "Отменить" after deleting: brings the contact back with all its notes
export async function restoreContact(
  contactId: number,
): Promise<RestoreContactState> {
  const id = parseId(contactId);
  if (!id) {
    return { error: "Контакт не найден" };
  }

  let restored: { id: number } | undefined;
  try {
    [restored] = await getDb()
      .update(contacts)
      .set({ deletedAt: null, updatedAt: sql`${contacts.updatedAt}` })
      .where(
        and(
          eq(contacts.id, id),
          isNotNull(contacts.deletedAt),
          gt(contacts.deletedAt, pastUndoWindow),
        ),
      )
      .returning({ id: contacts.id });
  } catch (error) {
    logDbError("Failed to restore contact", error);
    return {
      error:
        "Не получилось вернуть. Проверьте, что база данных запущена, и попробуйте ещё раз.",
    };
  }
  if (!restored) {
    return {
      error: `Не получилось вернуть: ${UNDO_SECONDS} секунд прошли, контакт удалён насовсем.`,
    };
  }

  revalidatePath("/", "layout");
  // Back to the card, as if nothing happened. Replace: Back must not lead
  // to the list with the stale "удалён" message.
  redirect(`/contacts/${restored.id}`, RedirectType.replace);
}

async function eraseDeletedContacts() {
  try {
    const erased = await getDb()
      .delete(contacts)
      .where(
        and(isNotNull(contacts.deletedAt), lte(contacts.deletedAt, pastUndoWindow)),
      )
      .returning({ id: contacts.id });
    if (erased.length > 0) {
      console.log(`Erased deleted contacts: ${erased.length}`);
    }
  } catch (error) {
    logDbError("Failed to erase deleted contacts", error);
  }
}

export async function addNote(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const id = parseId(contactId);
  const rawBody = formData.get("body");
  const body = typeof rawBody === "string" ? rawBody : "";
  if (!id) {
    return { body, error: "Контакт не найден" };
  }

  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: parsed.error.issues[0]?.message };
  }

  try {
    const [contact] = await getDb()
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
    if (!contact) {
      return { body, error: contactGoneMessage };
    }
    await getDb().insert(notes).values({ contactId: id, body: parsed.data.body });
  } catch (error) {
    logDbError("Failed to add note", error);
    return { body, error: saveFailedMessage };
  }

  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

// "Как часто общаться" in the card: one of the four frequencies, or null
// for "Не задано". Saved at once, without the edit form. The "Другое" date
// is cleared, so it is forgotten. The due time is not reset: it still
// counts from the last note.
export async function setContactFrequency(
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
    const updated = await getDb()
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

  revalidatePath("/", "layout");
  return {};
}

// "Другое": the dialog with a day and month like "16.12". The year is the
// nearest such date from today; "today" comes from the database, the same
// clock the due rule compares with. Only notes written after now count.
export async function setContactDate(
  contactId: number,
  _prevState: ContactDateFormState,
  formData: FormData,
): Promise<ContactDateFormState> {
  const id = parseId(contactId);
  const rawInput = formData.get("dayMonth");
  const input = typeof rawInput === "string" ? rawInput : "";
  if (!id) {
    return { input, error: "Контакт не найден" };
  }

  const dayMonth = parseDayMonth(input);
  if (!dayMonth) {
    return { input, error: invalidDateMessage };
  }

  try {
    const [{ today }] = await getDb().execute<{ today: string }>(
      sql`select current_date::text as today`,
    );
    const updated = await getDb()
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

  revalidatePath("/", "layout");
  return {};
}
