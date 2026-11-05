// How often to keep in touch with a contact. Shared by the server and the
// browser, so it has no imports: values, labels, intervals and the
// "Другое" date (day and month typed by hand, the year is picked by code).

// "on_date" is "Другое": one date to get in touch by, stored with its year.
// No value (null) means "Не задано".
export const contactFrequencies = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "on_date",
] as const;

export type ContactFrequency = (typeof contactFrequencies)[number];

// The four repeating frequencies: they can be saved by choosing them
export const regularFrequencies = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const satisfies readonly ContactFrequency[];

export type RegularFrequency = (typeof regularFrequencies)[number];

export const NO_FREQUENCY_LABEL = "Не задано";

export const frequencyLabels: Record<ContactFrequency, string> = {
  weekly: "Раз в неделю",
  monthly: "Раз в месяц",
  quarterly: "Раз в квартал",
  yearly: "Раз в год",
  on_date: "Другое…",
};

// PostgreSQL intervals. Months and years follow the calendar: the database
// moves 31 January + 1 month to 28 February by itself.
export const frequencyIntervals: Record<RegularFrequency, string> = {
  weekly: "7 days",
  monthly: "1 month",
  quarterly: "3 months",
  yearly: "1 year",
};

export type DayMonth = { day: number; month: number };

// Day and month separated by a dot, the leading zero is optional:
// "16.12", "5.1". Only a dot: a comma or other separators are rejected.
const dayMonthPattern = /^(\d{1,2})\.(\d{1,2})$/;

// "16.12" -> { day: 16, month: 12 }; null if it is not a real date.
// 29.02 is accepted: it exists in leap years.
export function parseDayMonth(input: string): DayMonth | null {
  const match = dayMonthPattern.exec(input.trim());
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1) {
    return null;
  }
  // 2000 is a leap year, so February has 29 days here
  return day <= daysInMonth(2000, month) ? { day, month } : null;
}

// The nearest such date starting from today (today itself counts).
// For 29.02 that is the nearest leap year. Dates are "YYYY-MM-DD" strings,
// like the PostgreSQL date type, so no time zone is involved.
export function nearestDate({ day, month }: DayMonth, today: string): string {
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const passedThisYear =
    month < todayMonth || (month === todayMonth && day < todayDay);
  let year = passedThisYear ? todayYear + 1 : todayYear;
  while (day > daysInMonth(year, month)) {
    year += 1;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

// "2026-12-16" -> "16.12": what the "Другое" date looks like in the card
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}

// The text in the frequency field of the card
export function frequencyDisplay(
  frequency: ContactFrequency | null,
  contactDate: string | null,
): string {
  if (frequency === null) {
    return NO_FREQUENCY_LABEL;
  }
  if (frequency === "on_date") {
    return contactDate ? `Другое: ${formatDayMonth(contactDate)}` : "Другое";
  }
  return frequencyLabels[frequency];
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
