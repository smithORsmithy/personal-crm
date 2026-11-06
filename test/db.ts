// Helpers for tests: connection to the test database, a transaction that
// is always rolled back, and a connection to a port with no database.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import type { Database } from "../src/db/types";

import { getTestDatabaseUrls, getUnreachableDatabaseUrl } from "./test-url";

// The same type the app code takes: a database or a transaction
export type TestDb = Database;

class Rollback extends Error {}

function connect(url: string) {
  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 3,
  });
  return { client, db: drizzle(client, { schema }) };
}

// Runs the test body in a transaction and rolls it back at the end:
// whatever the test writes is gone for the next one
export async function withRollback(
  body: (db: TestDb) => Promise<void>,
): Promise<void> {
  const { client, db } = connect(getTestDatabaseUrls().testUrl);
  try {
    await db.transaction(async (tx) => {
      await body(tx as unknown as TestDb);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

// A database nobody listens to: connecting fails for real
export async function withUnreachableDb(
  body: (db: TestDb) => Promise<void>,
): Promise<void> {
  const { client, db } = connect(getUnreachableDatabaseUrl());
  try {
    await body(db as unknown as TestDb);
  } finally {
    await client.end();
  }
}
