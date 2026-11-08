// Shared by the contact form (browser) and the server actions.
// Kept free of heavy imports so the browser bundle stays small.

import { z } from "zod";

import { parseGroupName } from "@/lib/groups/names";

import {
  invalidDateMessage,
  parseDayMonth,
  regularFrequencies,
  type DayMonth,
  type RegularFrequency,
} from "./frequency";
import { contactSchema, parseId } from "./validation";

export const contactFields = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
] as const;

export type ContactField = (typeof contactFields)[number];
export type ContactFormValues = Record<ContactField, string>;

export const emptyContactValues: ContactFormValues = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
};

export function readContactValues(formData: FormData): ContactFormValues {
  const values = { ...emptyContactValues };
  for (const field of contactFields) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

export function toContactFormValues(
  contact: Record<ContactField, string | null>,
): ContactFormValues {
  const values = { ...emptyContactValues };
  for (const field of contactFields) {
    values[field] = contact[field] ?? "";
  }
  return values;
}

export type ParsedContactForm =
  | {
      ok: true;
      data: z.output<typeof contactSchema>;
      groupIds: number[];
      newGroups: string[];
    }
  | {
      ok: false;
      values: ContactFormValues;
      errors: Partial<Record<ContactField, string[]>>;
      groupIds: number[];
      newGroups: string[];
    };

// Everything the add/edit form sends: the fields, checked, and the groups.
// Groups arrive as repeated fields: "groupId" for chosen groups and
// "newGroup" for names typed in the form, created only on save. Ids come
// from the browser, so wrong ones are dropped; the groups come back even
// when a field is wrong, so the form does not lose them.
export function parseContactForm(formData: FormData): ParsedContactForm {
  const groupIds = [
    ...new Set(
      formData
        .getAll("groupId")
        .map(parseId)
        .filter((id): id is number => id !== null),
    ),
  ];

  const newGroups: string[] = [];
  for (const raw of formData.getAll("newGroup")) {
    const parsed = parseGroupName(raw);
    if (
      parsed.ok &&
      !newGroups.some(
        (name) => name.toLowerCase() === parsed.name.toLowerCase(),
      )
    ) {
      newGroups.push(parsed.name);
    }
  }

  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      values,
      errors: z.flattenError(parsed.error).fieldErrors,
      groupIds,
      newGroups,
    };
  }
  return { ok: true, data: parsed.data, groupIds, newGroups };
}

// "Как часто общаться" in the add form: what is saved with the contact
export type FrequencyChoice =
  | { frequency: null }
  | { frequency: RegularFrequency }
  | { frequency: "on_date"; dayMonth: DayMonth };

export type ParsedFrequencyChoice = {
  // What was chosen and typed, to show again after an error
  frequency: string;
  dayMonth: string;
} & ({ ok: true; choice: FrequencyChoice } | { ok: false; error: string });

// The list sends "frequency"; the field under it sends "dayMonth" only
// while «Другое…» is chosen, and only then it counts. Anything not in the
// list (the browser was tampered with) is "Не задано": nothing odd is saved.
export function parseFrequencyChoice(
  formData: FormData,
): ParsedFrequencyChoice {
  const frequency = textOf(formData, "frequency");
  const dayMonth = textOf(formData, "dayMonth");

  if (frequency === "on_date") {
    const parsed = parseDayMonth(dayMonth);
    return parsed
      ? {
          ok: true,
          choice: { frequency: "on_date", dayMonth: parsed },
          frequency,
          dayMonth,
        }
      : { ok: false, error: invalidDateMessage, frequency, dayMonth };
  }

  const regular = regularFrequencies.find((value) => value === frequency);
  return {
    ok: true,
    choice: { frequency: regular ?? null },
    frequency,
    dayMonth,
  };
}

function textOf(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}
