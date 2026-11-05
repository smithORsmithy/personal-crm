import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClockIcon, UserPlusIcon } from "lucide-react";

import { ContactBrowser } from "@/components/contact-browser";
import { DeletedContactNotice } from "@/components/deleted-contact-notice";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { restoreContact } from "@/lib/contacts/actions";
import {
  countDueContacts,
  getRecentlyDeletedContact,
  listContacts,
} from "@/lib/contacts/queries";
import { parseId } from "@/lib/contacts/validation";
import { formatCount, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Контакты",
};

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title lg:text-title-lg">Контакты</h1>
        {/* On phones the buttons get their own row; when they do not fit
            side by side, each takes the full width */}
        <div className="flex flex-wrap gap-2 max-sm:basis-full sm:gap-3">
          {/* Until the number arrives, the same button without it:
              it can be pressed at once and does not jump */}
          <Suspense fallback={<KeepInTouchLink />}>
            <KeepInTouchLinkWithCount />
          </Suspense>
          <Link
            href="/contacts/new"
            className={cn(buttonVariants({ size: "lg" }), "max-sm:flex-auto")}
          >
            <UserPlusIcon />
            Добавить контакт
          </Link>
        </div>
      </div>
      <Suspense fallback={<ContactsSkeleton />}>
        <Contacts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const contactWord = ["контакт", "контакта", "контактов"] as const;

async function KeepInTouchLinkWithCount() {
  return <KeepInTouchLink count={await countDueContacts()} />;
}

// "Пора связаться · 3": how many people it is time to write to
function KeepInTouchLink({ count = 0 }: { count?: number }) {
  return (
    <Link
      href="/keep-in-touch"
      className={cn(
        buttonVariants({ variant: "outline", size: "lg" }),
        "max-sm:flex-auto",
      )}
      // Screen readers hear "Пора связаться: 3 контакта", not a dot
      aria-label={
        count > 0
          ? `Пора связаться: ${formatCount(count)} ${pluralize(count, contactWord)}`
          : undefined
      }
    >
      <ClockIcon />
      {count > 0 ? (
        <span>
          Пора связаться ·{" "}
          <span className="font-extrabold">{formatCount(count)}</span>
        </span>
      ) : (
        "Пора связаться"
      )}
    </Link>
  );
}

async function Contacts({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const { q, added, deleted } = await searchParams;
  const deletedId = parseId(deleted);
  const [contacts, deletedContact] = await Promise.all([
    listContacts(),
    // Gone for good after the undo window: then there is nothing to show
    deletedId ? getRecentlyDeletedContact(deletedId) : null,
  ]);

  return (
    <ContactBrowser
      contacts={contacts}
      initialQuery={typeof q === "string" ? q : ""}
      addedId={parseId(added)}
      notice={
        deletedContact && (
          <DeletedContactNotice
            contact={deletedContact}
            restoreAction={restoreContact.bind(null, deletedContact.id)}
          />
        )
      }
    />
  );
}

function ContactsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Загружаю контакты…</span>
      <Skeleton className="h-12 w-full rounded-full bg-card" />
      <Skeleton className="h-6 w-32" />
      <div className="divide-y divide-dashed rounded-lg bg-card shadow-note lg:shadow-note-lg">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
