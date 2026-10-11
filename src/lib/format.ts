// Russian plural forms: [1 контакт, 2 контакта, 5 контактов]
export function pluralize(
  count: number,
  [one, few, many]: readonly [string, string, string],
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// "1 000" with a non-breaking space. Done by hand instead of Intl so the
// server and the browser always render the same string.
export function formatCount(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

// Lowercase and treat "ё" as "е", so "Пётр" is found by "петр"
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е");
}

export function getInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]);
  return letters.join("").toUpperCase() || "?";
}
