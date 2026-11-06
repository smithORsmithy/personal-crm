"use client";

import { UndoNotice } from "@/components/undo-notice";
import type { RestoreContactState } from "@/lib/contacts/actions";
import type { RecentlyDeletedContact } from "@/lib/contacts/queries";

// "Контакт «…» удалён." with the undo button
export function DeletedContactNotice({
  contact,
  restoreAction,
}: {
  contact: RecentlyDeletedContact;
  restoreAction: () => Promise<RestoreContactState>;
}) {
  return (
    <UndoNotice
      message={`Контакт «${contact.name}» удалён.`}
      undoMsLeft={contact.undoMsLeft}
      restoreAction={restoreAction}
    />
  );
}
