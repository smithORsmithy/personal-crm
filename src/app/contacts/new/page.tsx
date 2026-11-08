import type { Metadata } from "next";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { createContact } from "@/lib/contacts/actions";
import { listGroups } from "@/lib/groups/queries";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink href="/">Все контакты</BackLink>
      <section className="rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg">
        <h1 className="mb-6 text-title lg:text-title-lg">Новый контакт</h1>
        <Suspense fallback={<NewContactFormSkeleton />}>
          <NewContactForm />
        </Suspense>
      </section>
    </div>
  );
}

async function NewContactForm() {
  return (
    <ContactForm
      action={createContact}
      groups={await listGroups()}
      withFrequency
      submitLabel="Добавить контакт"
      pendingLabel="Добавляю…"
      cancelHref="/"
    />
  );
}

function NewContactFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Загружаю форму…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}
