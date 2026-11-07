// Search in the "Группы" field. Pure functions shared by the card and the
// forms; no database, runs in the browser.

import { normalizeForSearch } from "@/lib/format";

type NamedGroup = { name: string };

// Groups whose name contains what was typed: capitals do not matter,
// "е" and "ё" are the same letter, like in the search by name
export function filterGroups<T extends NamedGroup>(
  groups: readonly T[],
  query: string,
): T[] {
  const needle = normalizeForSearch(query.trim());
  if (!needle) {
    return [...groups];
  }
  return groups.filter((group) =>
    normalizeForSearch(group.name).includes(needle),
  );
}

// "Создать группу «…»" is offered for a new name only. Same rule as in the
// database: a name that differs from an existing one in capitals only is
// the same group ("е" and "ё" stay different letters here).
export function canCreateGroup(
  groups: readonly NamedGroup[],
  query: string,
): boolean {
  const name = query.trim().toLowerCase();
  return (
    name !== "" && !groups.some((group) => group.name.toLowerCase() === name)
  );
}

export type FieldItem<T> =
  { kind: "group"; group: T } | { kind: "create"; name: string };

// The list under the field, in order: matching groups in the order they
// come (alphabetical from the server), then "Создать группу «…»" for a new
// name. While text is typed the first item is highlighted, so this order
// decides what Enter picks.
export function listFieldItems<T extends NamedGroup>(
  groups: readonly T[],
  query: string,
): FieldItem<T>[] {
  const items: FieldItem<T>[] = filterGroups(groups, query).map((group) => ({
    kind: "group",
    group,
  }));
  if (canCreateGroup(groups, query)) {
    items.push({ kind: "create", name: query.trim() });
  }
  return items;
}
