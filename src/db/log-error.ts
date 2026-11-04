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

type ErrorSummary = { type: string; [field: string]: unknown };

function describeError(error: unknown, depth = 0): ErrorSummary {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }

  const summary: ErrorSummary = { type: error.name };
  if (error instanceof DrizzleQueryError) {
    // Its name is plain "Error"; the values are in error.params, left out
    summary.type = "DrizzleQueryError";
    summary.query = error.query;
  }

  const fields = error as unknown as Record<string, unknown>;
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
