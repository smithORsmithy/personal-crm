import { z } from "zod";

// Optional text: trimmed, empty string is stored as null
function optionalText(max: number, tooLongMessage: string) {
  return z
    .string()
    .trim()
    .max(max, tooLongMessage)
    .transform((value) => value || null);
}

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(200, "Имя слишком длинное: не больше 200 символов"),
  about: optionalText(500, "Слишком длинно: не больше 500 символов"),
  howWeMet: optionalText(1000, "Слишком длинно: не больше 1000 символов"),
  phone: z
    .string()
    .trim()
    .max(50, "Слишком длинный номер: не больше 50 символов")
    .refine((value) => value === "" || /\d/.test(value), {
      message: "В номере телефона должны быть цифры",
    })
    .transform((value) => value || null),
  email: z
    .string()
    .trim()
    .max(254, "Слишком длинный адрес почты")
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Проверьте адрес почты, например: anna@example.com",
    })
    .transform((value) => value || null),
});

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст заметки")
    .max(10_000, "Заметка слишком длинная: не больше 10 000 символов"),
});

// Ids arrive from the URL or from the browser, so they are untrusted
export function parseId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}
