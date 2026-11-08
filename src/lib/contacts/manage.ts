// Deleting a contact, bringing it back, writing a note: the step between a
// server action and the database. Checks the input, changes only the
// contacts of the given user and turns the outcome into texts for people.
// Knows nothing about Next.js, so tests run it on the real test database.
// Someone else's contact is answered like one that does not exist.

import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { logDbError } from "@/db/log-error";
import { contacts, notes } from "@/db/schema";
import type { Database } from "@/db/types";
import { KEEP_DELETED_SECONDS, UNDO_SECONDS } from "@/lib/undo-window";

import { contactGoneMessage, saveFailedMessage } from "./commands";
import { noteSchema, parseId } from "./validation";

export const deleteFailedMessage =
  "Не получилось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
export const restoreFailedMessage =
  "Не получилось вернуть. Проверьте, что база данных запущена, и попробуйте ещё раз.";

// Deleted contacts older than the undo window: the database clock decides
const pastUndoWindow = sql`now() - interval '1 second' * ${KEEP_DELETED_SECONDS}`;

// Deleting only marks the contact: for a few seconds "Отменить" can bring it
// back. Then it is erased for good, and its notes go with it
// (notes.contact_id is ON DELETE CASCADE).
// deleted: false means there was nothing to delete (already deleted in
// another browser, or not this user's): not an error, the list just opens.
export async function deleteContactCommand(
  db: Database,
  ownerId: string,
  contactId: number,
): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> {
  const id = parseId(contactId);
  if (!id) {
    return { ok: false, error: "Контакт не найден" };
  }

  try {
    const [deleted] = await db
      .update(contacts)
      // updated_at is the time of the last edit of the contact's data:
      // deleting and restoring do not change it
      .set({ deletedAt: sql`now()`, updatedAt: sql`${contacts.updatedAt}` })
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.ownerId, ownerId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning({ id: contacts.id });
    return { ok: true, deleted: !!deleted };
  } catch (error) {
    logDbError("Failed to delete contact", error);
    return { ok: false, error: deleteFailedMessage };
  }
}

// "Отменить" after deleting: brings the contact back with all its notes
export async function restoreContactCommand(
  db: Database,
  ownerId: string,
  contactId: number,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const id = parseId(contactId);
  if (!id) {
    return { ok: false, error: "Контакт не найден" };
  }

  try {
    const [restored] = await db
      .update(contacts)
      .set({ deletedAt: null, updatedAt: sql`${contacts.updatedAt}` })
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.ownerId, ownerId),
          isNotNull(contacts.deletedAt),
          gt(contacts.deletedAt, pastUndoWindow),
        ),
      )
      .returning({ id: contacts.id });
    if (!restored) {
      return {
        ok: false,
        error: `Не получилось вернуть: ${UNDO_SECONDS} секунд прошли, контакт удалён насовсем.`,
      };
    }
    return { ok: true, id: restored.id };
  } catch (error) {
    logDbError("Failed to restore contact", error);
    return { ok: false, error: restoreFailedMessage };
  }
}

// Erases for good every contact past the undo window, together with its
// notes and links to groups. It trips over nobody's data: only contacts
// marked as deleted, whoever they belong to.
export async function eraseDeletedContacts(db: Database): Promise<number> {
  const erased = await db
    .delete(contacts)
    .where(
      and(
        isNotNull(contacts.deletedAt),
        lte(contacts.deletedAt, pastUndoWindow),
      ),
    )
    .returning({ id: contacts.id });
  return erased.length;
}

// What comes back to the note form: the typed text and an error, or nothing
export type NoteResult = { body?: string; error?: string };

export async function addNoteCommand(
  db: Database,
  ownerId: string,
  contactId: number,
  rawBody: unknown,
): Promise<NoteResult> {
  const id = parseId(contactId);
  const body = typeof rawBody === "string" ? rawBody : "";
  if (!id) {
    return { body, error: "Контакт не найден" };
  }

  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: parsed.error.issues[0]?.message };
  }

  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.ownerId, ownerId),
          isNull(contacts.deletedAt),
        ),
      );
    if (!contact) {
      return { body, error: contactGoneMessage };
    }
    await db.insert(notes).values({ contactId: id, body: parsed.data.body });
  } catch (error) {
    logDbError("Failed to add note", error);
    return { body, error: saveFailedMessage };
  }
  return {};
}
