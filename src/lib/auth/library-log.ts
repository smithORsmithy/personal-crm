// The log of the sign-in library (Better Auth), cleaned the same way as the
// errors of contacts and groups (src/db/log-error.ts). On its own the library
// prints a failed query whole, with its values: the session key, the key of
// a sign-in link, an email. No Next.js here: tests run it as is.

import { describeError } from "@/db/log-error";

type Level = "debug" | "info" | "warn" | "error";

// Given to the library as logger.log (create-auth.ts). Only the first line of
// the message: if a message ever carries the text of a failed query, its
// values come on the next line ("params: ..."). Attached errors keep only
// their safe fields; anything else attached is left out.
export function logAuthLibraryMessage(
  level: Level,
  message: string,
  ...attached: unknown[]
): void {
  const firstLine = String(message).split("\n")[0];
  const errors = attached
    .filter((value) => value instanceof Error)
    .map((error) => describeError(error));
  const line = [`[Better Auth] ${firstLine}`, ...errors];

  if (level === "error") {
    console.error(...line);
  } else if (level === "warn") {
    console.warn(...line);
  } else {
    console.log(...line);
  }
}
