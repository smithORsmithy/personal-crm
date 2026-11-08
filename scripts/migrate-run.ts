// Applies the database migrations. Used by scripts/migrate.ts (the server
// and `pnpm db:migrate`) and by the tests, so all of them take the same path.
//
// The email of the owner goes along: migration 0006 hands the contacts and
// groups that exist before sign-in to the user with that email. SQL cannot
// read an environment variable, so the email is put into a session setting
// of Postgres, on the one connection the migrations then run on.

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { normalizeEmail } from "../src/lib/auth/email";

export type MigrationsResult = { applied: number; total: number };

// The owner is missing or wrong. The text holds no data, so it is safe to
// print in a log (logDbError would hide it).
export class OwnerEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerEmailError";
  }
}

export async function runMigrations({
  url,
  migrationsFolder,
  ownerEmail,
}: {
  url: string;
  migrationsFolder: string;
  // As typed in OWNER_EMAIL; not set is allowed while there is no data to
  // hand over (the migration itself checks that)
  ownerEmail?: string;
}): Promise<MigrationsResult> {
  // A wrong address stops everything before the first change: the data would
  // go to an email nobody can sign in with
  const owner = ownerEmail?.trim() ? normalizeEmail(ownerEmail) : null;
  if (ownerEmail?.trim() && !owner) {
    throw new OwnerEmailError("OWNER_EMAIL is not a valid email address");
  }

  // One connection: the setting below lives as long as the connection
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);
  try {
    if (owner) {
      await db.execute(
        sql`select set_config('crm.owner_email', ${owner}, false)`,
      );
    }
    const before = await appliedCount(db);
    try {
      await migrate(db, { migrationsFolder });
    } catch (error) {
      // Migration 0006 refuses to run without an owner when there is data
      const cause = (error as { cause?: Error }).cause;
      if (cause?.message.startsWith("OWNER_EMAIL is not set")) {
        throw new OwnerEmailError(cause.message);
      }
      throw error;
    }
    const after = await appliedCount(db);
    return { applied: after - before, total: after };
  } finally {
    await client.end();
  }
}

// Drizzle keeps the list of applied migrations in drizzle.__drizzle_migrations
async function appliedCount(db: ReturnType<typeof drizzle>): Promise<number> {
  const [{ exists }] = await db.execute<{ exists: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (!exists) {
    return 0;
  }
  const [{ count }] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return count;
}
