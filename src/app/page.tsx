import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserPlusIcon } from "lucide-react";

import { ContactBrowser } from "@/components/contact-browser";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listContacts } from "@/lib/contacts/queries";
import { parseId } from "@/lib/contacts/validation";

export const metadata: Metadata = {
  title: "Контакты",
};

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title lg:text-title-lg">Контакты</h1>
        <Link href="/contacts/new" className={buttonVariants({ size: "lg" })}>
          <UserPlusIcon />
          Добавить контакт
        </Link>
      </div>
      <Suspense fallback={<ContactsSkeleton />}>
        <Contacts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Contacts({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const { q, added } = await searchParams;
  const contacts = await listContacts();

  return (
    <ContactBrowser
      contacts={contacts}
      initialQuery={typeof q === "string" ? q : ""}
      addedId={parseId(added)}
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
