import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { updateContact } from "@/lib/contacts/actions";
import { toContactFormValues } from "@/lib/contacts/form-values";
import { getContact } from "@/lib/contacts/queries";
import { parseId } from "@/lib/contacts/validation";

export const metadata: Metadata = {
  title: "Изменить контакт",
};

export default function EditContactPage({
  params,
}: PageProps<"/contacts/[id]/edit">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Suspense fallback={<EditContactSkeleton />}>
        <EditContact params={params} />
      </Suspense>
    </div>
  );
}

async function EditContact({
  params,
}: Pick<PageProps<"/contacts/[id]/edit">, "params">) {
  const id = parseId((await params).id);
  if (!id) {
    notFound();
  }
  const contact = await getContact(id);
  if (!contact) {
    notFound();
  }

  return (
    <>
      <BackLink href={`/contacts/${id}`}>{contact.name}</BackLink>
      <section className="rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg">
        <h1 className="mb-6 text-title lg:text-title-lg">
          Изменить контакт
        </h1>
        <ContactForm
          action={updateContact.bind(null, id)}
          defaultValues={toContactFormValues(contact)}
          submitLabel="Сохранить"
          pendingLabel="Сохраняю…"
          cancelHref={`/contacts/${id}`}
        />
      </section>
    </>
  );
}

function EditContactSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Загружаю контакт…</span>
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-5 rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    </div>
  );
}
