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
        className="flex flex-col gap-5 rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg"
      >
        <h2 id="notes-title" className="text-section">
          Заметки{" "}
          {notes.length > 0 && (
            <span className="font-script text-kicker font-normal text-accent">
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
          <ol className="flex flex-col divide-y divide-dashed border-t border-dashed">
            {notes.map((note) => (
              <li key={note.id} className="py-4 last:pb-0">
                {/* Handwritten date, like the second line of the landing's note */}
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="font-script text-kicker text-accent"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 leading-relaxed break-words whitespace-pre-wrap text-ink-2">
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
    <section className="relative rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg">
      {/* A strip of tape, like on the landing's paper note */}
      <span
        aria-hidden
        className="absolute -top-2.5 left-1/2 -ml-10.5 h-5.5 w-21 rotate-2 bg-tape lg:-top-3 lg:-ml-12.5 lg:h-6 lg:w-25"
      />
      <div className="flex items-start gap-3 sm:gap-4">
        <ContactAvatar id={contact.id} name={contact.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-title break-words lg:text-title-lg">
            {contact.name}
          </h1>
          {contact.about && (
            <p className="mt-1 font-script text-kicker break-words text-accent lg:text-kicker-lg">
              {contact.about}
            </p>
          )}
        </div>
        {/* On a phone only the pencil icon is shown to leave room for the name */}
        <Link
          href={`/contacts/${contact.id}/edit`}
          className={buttonVariants({
            variant: "outline",
            className: "max-sm:w-10 max-sm:px-0",
          })}
        >
          <PencilIcon />
          <span className="max-sm:sr-only">Изменить</span>
        </Link>
      </div>

      <dl className="mt-6 grid gap-5 border-t border-dashed pt-6 sm:grid-cols-2">
        <DetailItem icon={<PhoneIcon />} label="Телефон">
          {contact.phone && (
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
              className="underline-offset-4 hover:underline"
            >
              {contact.phone}
            </a>
          )}
        </DetailItem>
        <DetailItem icon={<MailIcon />} label="Почта">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="underline-offset-4 hover:underline"
            >
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
      <dt className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground [&_svg]:size-3.5">
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
      <div className="rounded-lg bg-card p-5 shadow-note sm:p-7 lg:shadow-note-lg">
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
      <Skeleton className="h-56 rounded-lg bg-card shadow-note" />
    </div>
  );
}
