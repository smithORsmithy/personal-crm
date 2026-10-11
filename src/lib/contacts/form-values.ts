// Shared by the contact form (browser) and the server actions.
// Kept free of heavy imports so the browser bundle stays small.

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
