"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";

import { getDb } from "@/db";
import { logDbError } from "@/db/log-error";
import { requireUserId } from "@/lib/auth/current-user";
import { parseId } from "@/lib/contacts/validation";
import { KEEP_DELETED_SECONDS } from "@/lib/undo-window";

import {
  addContactToGroupCommand,
  addContactToNewGroupCommand,
  contactGoneMessage,
  createGroupCommand,
  deleteGroupCommand,
  groupGoneMessage,
  removeContactFromGroupCommand,
  renameGroupCommand,
  restoreGroupCommand,
  saveFailedMessage,
} from "./commands";
import { eraseExpiredGroups } from "./store";

// Every action starts with requireUserId(): who is asking is known from the
// session on the server, never from what the browser sends. The commands take
// that user and touch only their groups and contacts.

// Forms on the "Группы" page. The typed text comes back with an error, so
// it stays in the field. savedAt changes after every success.
export type GroupFormState = {
  input?: string;
  error?: string;
  savedAt?: number;
};

export type DeleteGroupState = {
  error?: string;
};

export type RestoreGroupState = {
  error?: string;
};

function readName(formData: FormData): string {
  const value = formData.get("name");
  return typeof value === "string" ? value : "";
}

export async function createGroup(
  _prevState: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const ownerId = await requireUserId();
  const result = await createGroupCommand(getDb(), ownerId, readName(formData));
  if (!result.ok) {
    return { input: result.input, error: result.error };
  }
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

export async function renameGroup(
  groupId: number,
  _prevState: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const ownerId = await requireUserId();
  const name = readName(formData);
  const id = parseId(groupId);
  if (!id) {
    return { input: name, error: groupGoneMessage };
  }

  const result = await renameGroupCommand(getDb(), ownerId, id, name);
  if (!result.ok) {
    return { input: result.input, error: result.error };
  }
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

// Deleting only marks the group: for a few seconds "Отменить" can bring it
// back. Then it is erased for good, and its links to people go with it.
export async function deleteGroup(groupId: number): Promise<DeleteGroupState> {
  const ownerId = await requireUserId();
  const id = parseId(groupId);
  if (!id) {
    return { error: groupGoneMessage };
  }

  const result = await deleteGroupCommand(getDb(), ownerId, id);
  if (!result.ok) {
    return { error: result.error };
  }

  if (result.deleted) {
    // Runs after the response is sent; on shutdown the server waits for it.
    // It erases every group past the undo window, so one that was missed
    // (the server crashed) is erased by the next deletion.
    after(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, KEEP_DELETED_SECONDS * 1000 + 500),
      );
      try {
        const erased = await eraseExpiredGroups(getDb());
        if (erased > 0) {
          console.log(`Erased deleted groups: ${erased}`);
        }
      } catch (error) {
        logDbError("Failed to erase deleted groups", error);
      }
    });
  }

  revalidatePath("/", "layout");
  // Already deleted in another browser: nothing to report, just open the
  // list. Replace, not push: Back must not lead to a group that is gone.
  redirect(
    result.deleted ? `/groups?deleted=${id}` : "/groups",
    RedirectType.replace,
  );
}

// "Отменить" after deleting: brings the group back with all its people
export async function restoreGroup(
  groupId: number,
): Promise<RestoreGroupState> {
  const ownerId = await requireUserId();
  const id = parseId(groupId);
  if (!id) {
    return { error: groupGoneMessage };
  }

  const result = await restoreGroupCommand(getDb(), ownerId, id);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/", "layout");
  // Replace: Back must not lead to the page with the stale "удалена" message
  redirect("/groups", RedirectType.replace);
}

export type ContactGroupsState = {
  error?: string;
};

// Groups in the contact card: each change is saved at once, one group at a time

// A group or contact gone in another browser: the page is refreshed, so the
// list of groups in the field is up to date. A database error changes nothing.
function cardFailure(error: string): ContactGroupsState {
  if (error !== saveFailedMessage) {
    revalidatePath("/", "layout");
  }
  return { error };
}

export async function addContactToGroup(
  contactId: number,
  groupId: number,
): Promise<ContactGroupsState> {
  const ownerId = await requireUserId();
  const contact = parseId(contactId);
  const group = parseId(groupId);
  if (!contact || !group) {
    return { error: groupGoneMessage };
  }
  const result = await addContactToGroupCommand(
    getDb(),
    ownerId,
    contact,
    group,
  );
  if (!result.ok) {
    return cardFailure(result.error);
  }
  revalidatePath("/", "layout");
  return {};
}

export async function removeContactFromGroup(
  contactId: number,
  groupId: number,
): Promise<ContactGroupsState> {
  const ownerId = await requireUserId();
  const contact = parseId(contactId);
  const group = parseId(groupId);
  if (!contact || !group) {
    return { error: groupGoneMessage };
  }
  const result = await removeContactFromGroupCommand(
    getDb(),
    ownerId,
    contact,
    group,
  );
  if (!result.ok) {
    return cardFailure(result.error);
  }
  revalidatePath("/", "layout");
  return {};
}

export async function addContactToNewGroup(
  contactId: number,
  name: string,
): Promise<ContactGroupsState> {
  const ownerId = await requireUserId();
  const contact = parseId(contactId);
  if (!contact) {
    return { error: contactGoneMessage };
  }
  const result = await addContactToNewGroupCommand(
    getDb(),
    ownerId,
    contact,
    name,
  );
  if (!result.ok) {
    return cardFailure(result.error);
  }
  revalidatePath("/", "layout");
  return {};
}
