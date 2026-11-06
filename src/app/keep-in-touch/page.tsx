import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClockIcon, CircleCheckIcon } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { GroupFilter } from "@/components/group-filter";
import { Skeleton } from "@/components/ui/skeleton";
import type { DueContact } from "@/lib/contacts/due";
import { parseGroupParam } from "@/lib/contacts/filter";
import {
  hasContactsWithFrequency,
  listDueContacts,
} from "@/lib/contacts/queries";
import { formatDate } from "@/lib/format";
import { listGroups } from "@/lib/groups/queries";

export const metadata: Metadata = {
  title: "Пора связаться",
};

// People whose term has passed: who they are and what the last talk was
// about, to remember them before writing. The frequency and the due date
// are not shown here, only the order tells who is the most overdue.
export default function KeepInTouchPage({
  searchParams,
}: PageProps<"/keep-in-touch">) {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="text-title lg:text-title-lg">Пора связаться</h1>
      <Suspense fallback={<DueContactsSkeleton />}>
        <DueContacts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DueContacts({
  searchParams,
}: Pick<PageProps<"/keep-in-touch">, "searchParams">) {
  const { group } = await searchParams;
  const groups = await listGroups();
  // A number that is not among the groups (deleted since) means "Все"
  const groupId = parseGroupParam(group, groups);
  const contacts = await listDueContacts(groupId ?? undefined);

  return (
    <>
      {/* Every button is a link: the list is built on the server, and the
          choice stays in the address. "replace": Back leads away from the
          page, not through the filters. */}
      <GroupFilter
        mode="links"
        groups={groups}
        selectedId={groupId}
        hrefFor={(id) =>
          id === null ? "/keep-in-touch" : `/keep-in-touch?group=${id}`
        }
      />
      <DueList
        contacts={contacts}
        groupName={groups.find((item) => item.id === groupId)?.name}
      />
    </>
  );
}

async function DueList({
  contacts,
  groupName,
}: {
  contacts: DueContact[];
  groupName?: string;
}) {
  if (contacts.length === 0) {
    // Nobody has a frequency at all: the first thing to say
    if (!(await hasContactsWithFrequency())) {
      return (
        <EmptyState
          icon={<CalendarClockIcon className="text-muted-foreground" />}
          title="Частота пока не задана"
          text="Откройте карточку контакта и выберите, как часто хотите общаться."
        />
      );
    }
    return (
      <EmptyState
        icon={<CircleCheckIcon className="text-success" />}
        title={
          groupName === undefined
            ? "Со всеми на связи"
            : `В группе «${groupName}» сейчас никому не пора написать`
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-note lg:shadow-note-lg">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 border-b border-dashed px-4 py-2.5 text-xs font-bold text-muted-foreground md:grid">
        <span className="pl-13">Кто</span>
        <span>Последняя заметка</span>
      </div>
      <ul className="divide-y divide-dashed">
        {contacts.map((contact) => (
          <DueContactRow key={contact.id} contact={contact} />
        ))}
      </ul>
    </div>
  );
}

function DueContactRow({ contact }: { contact: DueContact }) {
  return (
    <li>
      {/* The card has the note form right away */}
      <Link
        href={`/contacts/${contact.id}`}
        className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:items-center md:py-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ContactAvatar id={contact.id} name={contact.name} />
          <div className="min-w-0">
            <div className="truncate font-bold">{contact.name}</div>
            {contact.about && (
              <div className="truncate text-sm text-muted-foreground">
                {contact.about}
              </div>
            )}
          </div>
        </div>
        {/* On phones it goes under the name, past the avatar */}
        <div className="min-w-0 pl-13 md:pl-0">
          {contact.lastNoteAt ? (
            <>
              <time
                dateTime={contact.lastNoteAt.toISOString()}
                className="block font-script text-kicker text-accent"
              >
                {formatDate(contact.lastNoteAt)}
              </time>
              <p className="line-clamp-2 text-sm break-words text-ink-2">
                {toOneLine(contact.lastNoteExcerpt ?? "")}
              </p>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Заметок ещё нет
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

// Line breaks of the note become spaces: two lines hold more of the text
function toOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
}) {
  return (
    // Dashed frame, like the empty contact list
    <div className="flex flex-col items-center gap-3 rounded-lg border-[1.5px] border-dashed border-input px-5 py-10 text-center sm:px-6 sm:py-12 [&_svg]:size-8">
      <span aria-hidden>{icon}</span>
      <p className="text-section">{title}</p>
      {text && <p className="max-w-xs text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

function DueContactsSkeleton() {
  return (
    <div
      className="divide-y divide-dashed rounded-lg bg-card shadow-note lg:shadow-note-lg"
      aria-busy="true"
    >
      <span className="sr-only">Загружаю список…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="grid gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:items-center"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-13 md:pl-0">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
