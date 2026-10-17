import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { createContact } from "@/lib/contacts/actions";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink href="/">Все контакты</BackLink>
      <section className="rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg">
        <h1 className="mb-6 text-title lg:text-title-lg">
          Новый контакт
        </h1>
        <ContactForm
          action={createContact}
          submitLabel="Добавить контакт"
          pendingLabel="Добавляю…"
          cancelHref="/"
        />
      </section>
    </div>
  );
}
