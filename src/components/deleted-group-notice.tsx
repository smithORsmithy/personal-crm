"use client";

import { UndoNotice } from "@/components/undo-notice";
import type { RestoreGroupState } from "@/lib/groups/actions";
import type { RecentlyDeletedGroup } from "@/lib/groups/queries";

// "Группа «…» удалена." with the undo button
export function DeletedGroupNotice({
  group,
  restoreAction,
}: {
  group: RecentlyDeletedGroup;
  restoreAction: () => Promise<RestoreGroupState>;
}) {
  return (
    <UndoNotice
      message={`Группа «${group.name}» удалена.`}
      undoMsLeft={group.undoMsLeft}
      restoreAction={restoreAction}
    />
  );
}
