"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";

import { getDb } from "@/db";
import { logDbError } from "@/db/log-error";
import { requireUserId } from "@/lib/auth/current-user";

import {
  contactGoneMessage,
  saveFailedMessage,
  setContactDateCommand,
  setContactFrequencyCommand,
  type ContactDateFormState,
  type ContactFrequencyState,
} from "./commands";
import {
  parseContactForm,
  readContactValues,
  type ContactField,
  type ContactFormValues,
} from "./form-values";
import type { RegularFrequency } from "./frequency";
import { KEEP_DELETED_SECONDS } from "@/lib/undo-window";
import {
  addNoteCommand,
  deleteContactCommand,
  eraseDeletedContacts,
  restoreContactCommand,
} from "./manage";
import { createContactWithGroups, updateContactWithGroups } from "./save";
import { parseId } from "./validation";

// Every action starts with requireUserId(): who is asking is known from the
// session on the server, never from what the browser sends. The functions
// below take that user and touch only their contacts.

export type { ContactDateFormState, ContactFrequencyState } from "./commands";

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

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const ownerId = await requireUserId();
  const parsed = parseContactForm(formData);
  const selection = { groupIds: parsed.groupIds, newGroups: parsed.newGroups };
  if (!parsed.ok) {
    return { ...selection, values: parsed.values, errors: parsed.errors };
  }

  let id: number;
  try {
    id = await createContactWithGroups(
      getDb(),
      ownerId,
      parsed.data,
      selection,
    );
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
  const ownerId = await requireUserId();
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
      ownerId,
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

// Deleting only marks the contact: for a few seconds "Отменить" can bring it
// back. Then it is erased for good, and its notes go with it
// (notes.contact_id is ON DELETE CASCADE).
// Used with useActionState, which also passes the previous state: not needed here
export async function deleteContact(
  contactId: number,
): Promise<DeleteContactState> {
  const ownerId = await requireUserId();
  const result = await deleteContactCommand(getDb(), ownerId, contactId);
  if (!result.ok) {
    return { error: result.error };
  }

  if (result.deleted) {
    // Runs after the response is sent; on shutdown the server waits for it.
    // It erases every contact past the undo window, so one that was missed
    // (the server crashed) is erased by the next deletion.
    after(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, KEEP_DELETED_SECONDS * 1000 + 500),
      );
      try {
        const erased = await eraseDeletedContacts(getDb());
        if (erased > 0) {
          console.log(`Erased deleted contacts: ${erased}`);
        }
      } catch (error) {
        logDbError("Failed to erase deleted contacts", error);
      }
    });
  }

  revalidatePath("/", "layout");
  // Already deleted in another browser (or not this user's contact): nothing
  // to report, just open the list. Replace, not push: Back must not lead to
  // the card that is gone.
  redirect(
    result.deleted ? `/?deleted=${contactId}` : "/",
    RedirectType.replace,
  );
}

// "Отменить" after deleting: brings the contact back with all its notes
export async function restoreContact(
  contactId: number,
): Promise<RestoreContactState> {
  const ownerId = await requireUserId();
  const result = await restoreContactCommand(getDb(), ownerId, contactId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/", "layout");
  // Back to the card, as if nothing happened. Replace: Back must not lead
  // to the list with the stale "удалён" message.
  redirect(`/contacts/${result.id}`, RedirectType.replace);
}

export async function addNote(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const ownerId = await requireUserId();
  const result = await addNoteCommand(
    getDb(),
    ownerId,
    contactId,
    formData.get("body"),
  );
  if (result.error !== undefined) {
    return result;
  }

  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

// "Как часто общаться" in the card: one of the four frequencies, or null
// for "Не задано". Saved at once, without the edit form (see commands.ts).
export async function setContactFrequency(
  contactId: number,
  frequency: RegularFrequency | null,
): Promise<ContactFrequencyState> {
  const ownerId = await requireUserId();
  const result = await setContactFrequencyCommand(
    getDb(),
    ownerId,
    contactId,
    frequency,
  );
  if (!result.error) {
    revalidatePath("/", "layout");
  }
  return result;
}

// "Другое": the dialog with a day and month like "16.12" (see commands.ts)
export async function setContactDate(
  contactId: number,
  _prevState: ContactDateFormState,
  formData: FormData,
): Promise<ContactDateFormState> {
  const ownerId = await requireUserId();
  const result = await setContactDateCommand(
    getDb(),
    ownerId,
    contactId,
    formData.get("dayMonth"),
  );
  if (!result.error) {
    revalidatePath("/", "layout");
  }
  return result;
}
