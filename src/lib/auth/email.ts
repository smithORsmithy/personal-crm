// The email rules of sign-in, in one place: the form, the server action and
// the migration script all use them. No Next.js here, so tests run it as is.

import { z } from "zod";

// The same check Better Auth runs on the address inside
const emailSchema = z.email();

// Spaces around the address go, capitals do not matter: "  Anna@Example.COM "
// and "anna@example.com" are one user. Returns null for a wrong address.
// Input comes from a form or a request, so it is untrusted: anything but
// text is a wrong address.
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const parsed = emailSchema.safeParse(input.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}
