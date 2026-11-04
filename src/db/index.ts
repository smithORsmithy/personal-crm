import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { getDatabaseUrl } from "./url";

function connect() {
  return drizzle(postgres(getDatabaseUrl(), { max: 10 }), { schema });
}

// Kept on globalThis so that hot reloads in development reuse one
// connection pool: otherwise every code change would open a new one.
const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof connect>;
};

// The connection is set up on the first query, not when this file loads.
// `next build` loads every file but runs no queries, so the build needs
// no database settings.
export function getDb() {
  globalForDb.db ??= connect();
  return globalForDb.db;
}
