import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MailIcon, PencilIcon, PhoneIcon, UsersIcon } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { NoteForm } from "@/components/note-form";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Contact } from "@/db/schema";
import { addNote } from "@/lib/contacts/actions";
import { getContact, listNotes } from "@/lib/contacts/queries";
import { parseId } from "@/lib/contacts/validation";
import { formatDateTime } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const contact = id ? await getContact(id) : null;
  return { title: contact?.name ?? "Контакт не найден" };
}

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <BackLink href="/">Все контакты</BackLink>
      <Suspense fallback={<ContactSkeleton />}>
        <ContactCard params={params} />
      </Suspense>
    </div>
  );
}

async function ContactCard({
  params,
}: Pick<PageProps<"/contacts/[id]">, "params">) {
  const id = parseId((await params).id);
  if (!id) {
    notFound();
  }
  const [contact, notes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) {
    notFound();
  }

  return (
    <>
      <ContactDetails contact={contact} />

      <section
        aria-labelledby="notes-title"
        className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6"
      >
        <h2 id="notes-title" className="text-lg font-semibold">
          Заметки{" "}
          {notes.length > 0 && (
            <span className="font-normal text-muted-foreground">
              {notes.length}
            </span>
          )}
        </h2>

        <NoteForm action={addNote.bind(null, contact.id)} />

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет заметок. Запишите, о чём поговорили и о чём договорились, —
            и контекст не потеряется.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border bg-muted/30 p-4">
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {note.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function ContactDetails({ contact }: { contact: Contact }) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <ContactAvatar id={contact.id} name={contact.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {contact.name}
          </h1>
          {contact.about && (
            <p className="mt-1 break-words text-muted-foreground">
              {contact.about}
            </p>
          )}
        </div>
        {/* On a phone only the pencil icon is shown to leave room for the name */}
        <Link
          href={`/contacts/${contact.id}/edit`}
          className={buttonVariants({ variant: "outline", className: "max-sm:px-2" })}
        >
          <PencilIcon />
          <span className="max-sm:sr-only">Изменить</span>
        </Link>
      </div>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        <DetailItem icon={<PhoneIcon />} label="Телефон">
          {contact.phone && (
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
              className="hover:underline"
            >
              {contact.phone}
            </a>
          )}
        </DetailItem>
        <DetailItem icon={<MailIcon />} label="Почта">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="hover:underline">
              {contact.email}
            </a>
          )}
        </DetailItem>
        <DetailItem
          icon={<UsersIcon />}
          label="Откуда знакомы"
          className="sm:col-span-2"
        >
          {contact.howWeMet && (
            <span className="whitespace-pre-wrap">{contact.howWeMet}</span>
          )}
        </DetailItem>
      </dl>
    </section>
  );
}

function DetailItem({
  icon,
  label,
  className,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 break-words">
        {children || <span className="text-muted-foreground">Не указано</span>}
      </dd>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Загружаю карточку…</span>
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
      <Skeleton className="h-56 rounded-xl bg-card" />
    </div>
  );
}
