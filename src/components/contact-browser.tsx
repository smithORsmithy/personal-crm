"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react";

import { ContactAvatar } from "@/components/contact-avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContactListItem } from "@/lib/contacts/queries";
import {
  formatCount,
  normalizeForSearch,
  pluralize,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const contactWord = ["контакт", "контакта", "контактов"] as const;

export function ContactBrowser({
  contacts,
  initialQuery,
  addedId,
}: {
  contacts: ContactListItem[];
  initialQuery: string;
  addedId: number | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  // Typing stays responsive while the list re-renders in the background
  const deferredQuery = useDeferredValue(query);

  const searchableNames = useMemo(
    () => contacts.map((contact) => normalizeForSearch(contact.name)),
    [contacts],
  );

  // Every word of the query must appear in the name: "анна смир" finds
  // "Анна Смирнова", and so does "смирнова анна"
  const visibleContacts = useMemo(() => {
    const words = normalizeForSearch(deferredQuery).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return contacts;
    }
    return contacts.filter((_, index) =>
      words.every((word) => searchableNames[index].includes(word)),
    );
  }, [contacts, searchableNames, deferredQuery]);

  const addedContact =
    addedId === null
      ? undefined
      : contacts.find((contact) => contact.id === addedId);

  // Show the just added contact: it may be far down the list
  useEffect(() => {
    if (addedId === null) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`contact-${addedId}`)
        ?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [addedId]);

  function changeQuery(value: string) {
    setQuery(value);
    // Keep the search in the address bar, so reload and Back keep it too
    const url = new URL(window.location.href);
    url.searchParams.delete("added");
    if (value.trim()) {
      url.searchParams.set("q", value.trim());
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState(null, "", url);
  }

  const isSearching = deferredQuery.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      {addedContact && (
        <p
          role="status"
          className="rounded-lg border border-accent/30 bg-highlight px-4 py-3 text-sm text-ink-2"
        >
          Контакт «{addedContact.name}» добавлен. Он подсвечен в списке.
        </p>
      )}

      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              changeQuery("");
            }
          }}
          placeholder="Найти по имени"
          aria-label="Найти контакт по имени"
          autoComplete="off"
          spellCheck={false}
          className="h-12 rounded-full bg-card pr-12 pl-11 text-base md:text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => changeQuery("")}
            aria-label="Очистить поиск"
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* Handwritten caption, like "знакомо?" on the landing */}
      <p
        className="font-script text-kicker text-accent lg:text-kicker-lg"
        aria-live="polite"
      >
        {isSearching
          ? `Найдено: ${formatCount(visibleContacts.length)} из ${formatCount(contacts.length)}`
          : `${formatCount(contacts.length)} ${pluralize(contacts.length, contactWord)}`}
      </p>

      {contacts.length === 0 ? (
        <EmptyState
          title="Пока нет ни одного контакта"
          text="Добавьте первого человека — коллегу, друга или нового знакомого."
        />
      ) : visibleContacts.length === 0 ? (
        <EmptyState
          title={`Никого не нашли по запросу «${deferredQuery.trim()}»`}
          text="Проверьте, как написано имя, или добавьте новый контакт."
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-card shadow-note lg:shadow-note-lg">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-4 border-b border-dashed px-4 py-2.5 text-xs font-bold text-muted-foreground md:grid">
            <span className="pl-13">Кто</span>
            <span>Откуда знакомы</span>
            <span>Телефон и почта</span>
          </div>
          <ul className="divide-y divide-dashed">
            {visibleContacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                highlighted={contact.id === addedId}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContactRow({
  contact,
  highlighted,
}: {
  contact: ContactListItem;
  highlighted: boolean;
}) {
  return (
    <li
      id={`contact-${contact.id}`}
      // Lets the browser skip layout for rows outside the screen
      className="[contain-intrinsic-size:auto_4.5rem] [content-visibility:auto]"
    >
      <Link
        href={`/contacts/${contact.id}`}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center",
          highlighted && "bg-highlight hover:bg-highlight",
        )}
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
        <div className="hidden truncate text-sm text-muted-foreground md:block">
          {contact.howWeMet}
        </div>
        <div className="min-w-0 pl-13 text-sm md:pl-0">
          {contact.phone && <div className="truncate">{contact.phone}</div>}
          {contact.email && (
            <div className="truncate text-muted-foreground">
              {contact.email}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    // Dashed frame, like the "works everywhere" plate on the landing
    <div className="flex flex-col items-center gap-3 rounded-lg border-[1.5px] border-dashed border-input px-6 py-12 text-center">
      <p className="text-section">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      <Link
        href="/contacts/new"
        className={cn(buttonVariants({ variant: "outline" }), "mt-2")}
      >
        <UserPlusIcon />
        Добавить контакт
      </Link>
    </div>
  );
}
