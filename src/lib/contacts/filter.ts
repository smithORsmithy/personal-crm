// The home page list narrowed by a search and by a group. Pure functions
// that run in the browser and in tests; no database.

import { normalizeForSearch } from "@/lib/format";

import { parseId } from "./validation";

// Every word of the query must appear in the name: "анна смир" finds
// "Анна Смирнова", and so does "смирнова анна". "е" and "ё" are the same.
// With a group chosen, only its people are searched.
export function filterContacts<
  T extends { name: string; groupIds: readonly number[] },
>(
  contacts: readonly T[],
  { query, groupId }: { query: string; groupId: number | null },
): T[] {
  const inGroup =
    groupId === null
      ? contacts
      : contacts.filter((contact) => contact.groupIds.includes(groupId));
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [...inGroup];
  }
  return inGroup.filter((contact) => {
    const name = normalizeForSearch(contact.name);
    return words.every((word) => name.includes(word));
  });
}

// The ?group= parameter of the address: the id of an existing group, or
// null ("Все") for anything else. A group deleted since the link was made
// is not found among the groups, so the page falls back to "Все".
export function parseGroupParam(
  value: string | string[] | undefined,
  groups: readonly { id: number }[],
): number | null {
  const id = parseId(value);
  return id !== null && groups.some((group) => group.id === id) ? id : null;
}
