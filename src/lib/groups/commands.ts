// The step between a server action and the database: checks the input,
// calls store.ts and turns the outcome into texts for people. Knows nothing
// about Next.js, so tests run it on the real test database.

import { logDbError } from "@/db/log-error";
import type { Database } from "@/db/types";
import { UNDO_SECONDS } from "@/lib/undo-window";

import { parseGroupName } from "./names";
import * as store from "./store";

export const saveFailedMessage =
  "Не получилось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
export const groupGoneMessage = "Группа не найдена: возможно, её удалили";
export const deleteFailedMessage =
  "Не получилось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
export const restoreFailedMessage =
  "Не получилось вернуть. Проверьте, что база данных запущена, и попробуйте ещё раз.";

export function groupExistsMessage(name: string): string {
  return `Группа «${name}» уже есть`;
}

// A failure keeps the typed text, so it stays in the field
export type GroupFailure = { ok: false; error: string; input: string };

function toInput(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

export async function createGroupCommand(
  db: Database,
  ownerId: string,
  rawName: unknown,
): Promise<{ ok: true; group: { id: number; name: string } } | GroupFailure> {
  const input = toInput(rawName);
  const parsed = parseGroupName(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, input };
  }

  try {
    const outcome = await store.createGroup(db, ownerId, parsed.name);
    if (outcome.status === "exists") {
      return {
        ok: false,
        error: groupExistsMessage(outcome.group.name),
        input,
      };
    }
    return { ok: true, group: outcome.group };
  } catch (error) {
    logDbError("Failed to create group", error);
    return { ok: false, error: saveFailedMessage, input };
  }
}

export async function renameGroupCommand(
  db: Database,
  ownerId: string,
  groupId: number,
  rawName: unknown,
): Promise<{ ok: true } | GroupFailure> {
  const input = toInput(rawName);
  const parsed = parseGroupName(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, input };
  }

  try {
    const outcome = await store.renameGroup(db, ownerId, groupId, parsed.name);
    if (outcome.status === "taken") {
      return { ok: false, error: groupExistsMessage(outcome.name), input };
    }
    if (outcome.status === "not_found") {
      return { ok: false, error: groupGoneMessage, input };
    }
    return { ok: true };
  } catch (error) {
    logDbError("Failed to rename group", error);
    return { ok: false, error: saveFailedMessage, input };
  }
}

// deleted: false means it was deleted already (in another browser): not an
// error, there is just nothing to undo
export async function deleteGroupCommand(
  db: Database,
  ownerId: string,
  groupId: number,
): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> {
  try {
    return {
      ok: true,
      deleted: await store.softDeleteGroup(db, ownerId, groupId),
    };
  } catch (error) {
    logDbError("Failed to delete group", error);
    return { ok: false, error: deleteFailedMessage };
  }
}

export async function restoreGroupCommand(
  db: Database,
  ownerId: string,
  groupId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const outcome = await store.restoreGroup(db, ownerId, groupId);
    if (outcome.status === "expired") {
      return {
        ok: false,
        error: `Не получилось вернуть: ${UNDO_SECONDS} секунд прошли, группа удалена насовсем.`,
      };
    }
    if (outcome.status === "taken") {
      return {
        ok: false,
        error: `Не получилось вернуть: уже есть группа «${outcome.name}».`,
      };
    }
    return { ok: true };
  } catch (error) {
    logDbError("Failed to restore group", error);
    return { ok: false, error: restoreFailedMessage };
  }
}

export const contactGoneMessage = "Контакт не найден: возможно, его удалили";

type MembershipResult = { ok: true } | { ok: false; error: string };

function membershipResult(outcome: store.MembershipOutcome): MembershipResult {
  if (outcome.status === "contact_not_found") {
    return { ok: false, error: contactGoneMessage };
  }
  if (outcome.status === "group_not_found") {
    return { ok: false, error: groupGoneMessage };
  }
  return { ok: true };
}

export async function addContactToGroupCommand(
  db: Database,
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<MembershipResult> {
  try {
    return membershipResult(
      await store.addContactToGroup(db, ownerId, contactId, groupId),
    );
  } catch (error) {
    logDbError("Failed to add contact to group", error);
    return { ok: false, error: saveFailedMessage };
  }
}

export async function removeContactFromGroupCommand(
  db: Database,
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<MembershipResult> {
  try {
    return membershipResult(
      await store.removeContactFromGroup(db, ownerId, contactId, groupId),
    );
  } catch (error) {
    logDbError("Failed to remove contact from group", error);
    return { ok: false, error: saveFailedMessage };
  }
}

export async function addContactToNewGroupCommand(
  db: Database,
  ownerId: string,
  contactId: number,
  rawName: unknown,
): Promise<MembershipResult> {
  const parsed = parseGroupName(rawName);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  try {
    return membershipResult(
      await store.addContactToNewGroup(db, ownerId, contactId, parsed.name),
    );
  } catch (error) {
    logDbError("Failed to add contact to a new group", error);
    return { ok: false, error: saveFailedMessage };
  }
}
