"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";

import {
  readContactValues,
  type ContactField,
  type ContactFormValues,
} from "./form-values";
import { contactSchema, noteSchema, parseId } from "./validation";

export type ContactFormState = {
  values?: ContactFormValues;
  errors?: Partial<Record<ContactField, string[]>>;
  message?: string;
};

export type NoteFormState = {
  body?: string;
  error?: string;
  savedAt?: number;
};

const saveFailedMessage =
  "Не получилось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: z.flattenError(parsed.error).fieldErrors };
  }

  let id: number;
  try {
    const [created] = await db
      .insert(contacts)
      .values(parsed.data)
      .returning({ id: contacts.id });
    id = created.id;
  } catch (error) {
    console.error("Failed to create contact", error);
    return { values, message: saveFailedMessage };
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

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const updated = await db
      .update(contacts)
      .set(parsed.data)
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return { values, message: "Контакт не найден: возможно, его удалили" };
    }
  } catch (error) {
    console.error("Failed to update contact", error);
    return { values, message: saveFailedMessage };
  }

  revalidatePath("/", "layout");
  redirect(`/contacts/${id}`);
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
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, id));
    if (!contact) {
      return { body, error: "Контакт не найден: возможно, его удалили" };
    }
    await db.insert(notes).values({ contactId: id, body: parsed.data.body });
  } catch (error) {
    console.error("Failed to add note", error);
    return { body, error: saveFailedMessage };
  }

  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}
