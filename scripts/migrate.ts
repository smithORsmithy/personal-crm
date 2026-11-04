// Applies database migrations from ./drizzle and exits.
// In production it runs as a one-off container from the new image before
// the new app version starts: if it fails, the new version is not started.

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { logDbError } from "../src/db/log-error";
import { getDatabaseUrl, loadEnvFile } from "../src/db/url";

const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR ?? "./drizzle";

async function main() {
  loadEnvFile();
  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    const before = await appliedCount(db);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const after = await appliedCount(db);
    console.log(
      `Migrations: ${after - before} applied now, ${after} in total.`,
    );
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

main().catch((error) => {
  logDbError("Migrations failed", error);
  process.exitCode = 1;
});
