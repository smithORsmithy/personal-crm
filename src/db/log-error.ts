import { DrizzleQueryError } from "drizzle-orm";

// Logs a failed database call without the data it carried.
// A Drizzle error holds every value of the query (a contact's name, phone,
// email, notes), and a Postgres error can quote row values in its message
// and detail. Logs leave the server: when a deploy fails, the last app log
// lines go to the public GitHub Actions log. So only technical fields are
// kept: the SQL with $1 placeholders instead of values, and error codes.
// No "server-only" here: the migration and seed scripts use it too.
export function logDbError(context: string, error: unknown): void {
  console.error(context, describeError(error));
}

// Fields that never hold user data: the Postgres error code and names of
// the table, column and constraint; for network errors the system code
// and the database address
const SAFE_FIELDS = [
  "code",
  "table_name",
  "column_name",
  "constraint_name",
  "syscall",
  "address",
  "port",
] as const;

// Guards against an error whose cause chain loops back on itself
const MAX_CAUSE_DEPTH = 5;

export type ErrorSummary = { type: string; [field: string]: unknown };

// The safe fields of an error and of its causes. Also used for the messages
// of the sign-in library (src/lib/auth/library-log.ts).
export function describeError(error: unknown, depth = 0): ErrorSummary {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }

  const summary: ErrorSummary = { type: error.name };
  const fields = error as unknown as Record<string, unknown>;
  if (isDrizzleQueryError(error, fields)) {
    // Its name is plain "Error"; the values are in error.params, left out
    summary.type = "DrizzleQueryError";
    summary.query = fields.query;
  }

  for (const field of SAFE_FIELDS) {
    const value = fields[field];
    if (typeof value === "string" || typeof value === "number") {
      summary[field] = value;
    }
  }

  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    summary.cause = describeError(error.cause, depth + 1);
  }
  return summary;
}

// A failed Drizzle query: its class, or its fields. Next.js puts a copy of
// drizzle-orm into each part of the build, while the connection to the
// database is one for the whole app (getDb() keeps it on globalThis), so its
// errors may be made by another copy's class. Drizzle always sends the values
// apart, in params, and puts $1, $2 in the query text. A postgres.js error
// also has a query, but keeps its values in "parameters": it is not taken.
function isDrizzleQueryError(
  error: Error,
  fields: Record<string, unknown>,
): boolean {
  return (
    error instanceof DrizzleQueryError ||
    (typeof fields.query === "string" && Array.isArray(fields.params))
  );
}
