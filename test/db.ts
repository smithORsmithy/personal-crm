// Helpers for tests: connection to the test database, a transaction that
// is always rolled back, and a connection to a port with no database.

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { users } from "../src/db/schema";
import type { Database } from "../src/db/types";

import { TEST_OWNER_EMAIL } from "./recreate-db";
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
// whatever the test writes is gone for the next one. The body gets the id of
// the owner, the user who has the five initial groups (every database has
// him, see the migrations); his data is what most tests work with.
export async function withRollback(
  body: (db: TestDb, owner: string) => Promise<void>,
): Promise<void> {
  const { client, db } = connect(getTestDatabaseUrls().testUrl);
  try {
    await db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, TEST_OWNER_EMAIL));
      await body(tx as unknown as TestDb, owner.id);
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
  body: (db: TestDb, owner: string) => Promise<void>,
): Promise<void> {
  const { client, db } = connect(getUnreachableDatabaseUrl());
  try {
    // No database to ask: any id will do, nothing is looked up
    await body(db as unknown as TestDb, "owner-id");
  } finally {
    await client.end();
  }
}
