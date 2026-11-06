// The group name rules, shared by the browser (input length) and the server
// (checking). Kept free of heavy imports so the browser bundle stays small.

import { z } from "zod";

export const GROUP_NAME_MAX_LENGTH = 50;

const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите название группы")
  .max(
    GROUP_NAME_MAX_LENGTH,
    `Название слишком длинное: не больше ${GROUP_NAME_MAX_LENGTH} символов`,
  );

export type GroupNameResult =
  { ok: true; name: string } | { ok: false; error: string };

// Input comes from a form, so it is untrusted: anything but text is empty
export function parseGroupName(input: unknown): GroupNameResult {
  const parsed = groupNameSchema.safeParse(
    typeof input === "string" ? input : "",
  );
  return parsed.success
    ? { ok: true, name: parsed.data }
    : { ok: false, error: parsed.error.issues[0].message };
}
