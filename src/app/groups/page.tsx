import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TagsIcon } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { DeletedGroupNotice } from "@/components/deleted-group-notice";
import { GroupRowActions } from "@/components/group-row-actions";
import { NewGroupForm } from "@/components/new-group-form";
import { Skeleton } from "@/components/ui/skeleton";
import { parseId } from "@/lib/contacts/validation";
import {
  createGroup,
  deleteGroup,
  renameGroup,
  restoreGroup,
} from "@/lib/groups/actions";
import { getRecentlyDeletedGroup, listGroups } from "@/lib/groups/queries";
import { formatContactCount } from "@/lib/groups/text";

export const metadata: Metadata = {
  title: "Группы",
};

export default function GroupsPage({
  searchParams,
}: PageProps<"/groups">) {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="text-title lg:text-title-lg">Группы</h1>
      <Suspense fallback={<GroupsSkeleton />}>
        <Groups searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Groups({
  searchParams,
}: Pick<PageProps<"/groups">, "searchParams">) {
  const { deleted } = await searchParams;
  const deletedId = parseId(deleted);
  const [groups, deletedGroup] = await Promise.all([
    listGroups(),
    // Gone for good after the undo window: then there is nothing to show
    deletedId ? getRecentlyDeletedGroup(deletedId) : null,
  ]);

  return (
    <div className="flex flex-col gap-5">
      {deletedGroup && (
        <DeletedGroupNotice
          group={deletedGroup}
          restoreAction={restoreGroup.bind(null, deletedGroup.id)}
        />
      )}
      <NewGroupForm action={createGroup} />

      {groups.length === 0 ? (
        // Dashed frame, like the empty contact list
        <div className="flex flex-col items-center gap-3 rounded-lg border-[1.5px] border-dashed border-input px-5 py-10 text-center sm:px-6 sm:py-12 [&_svg]:size-8">
          <TagsIcon className="text-muted-foreground" aria-hidden />
          <p className="text-section">Групп пока нет</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Создайте первую группу — например, «Семья» или «Теннис».
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-dashed rounded-lg bg-card shadow-note lg:shadow-note-lg">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/?group=${group.id}`}
                  className="block font-bold break-words underline-offset-4 outline-none hover:underline focus-visible:underline"
                >
                  {group.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {formatContactCount(group.contactCount)}
                </span>
              </div>
              <GroupRowActions
                groupId={group.id}
                groupName={group.name}
                contactCount={group.contactCount}
                renameAction={renameGroup.bind(null, group.id)}
                deleteAction={deleteGroup.bind(null, group.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Загружаю группы…</span>
      <Skeleton className="h-20 w-full" />
      <div className="divide-y divide-dashed rounded-lg bg-card shadow-note lg:shadow-note-lg">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
