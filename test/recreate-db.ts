// Drops a test database, creates it again and applies every migration:
// each run starts from an empty database. This also proves the migrations
// work on an empty database.

import postgres from "postgres";

import { runMigrations } from "../scripts/migrate-run";

import { assertTestDatabaseName, type TestDatabaseUrls } from "./test-url";

// The owner of the initial groups in every test database
export const TEST_OWNER_EMAIL = "owner@example.test";

// Drops the database and creates it again, with nothing in it
export async function createEmptyDatabase({
  adminUrl,
  testName,
}: TestDatabaseUrls): Promise<void> {
  assertTestDatabaseName(testName);

  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    try {
      await admin`select 1`;
    } catch {
      throw new Error(
        "Test database is not reachable: start it with docker compose up -d",
      );
    }
    const identifier = admin(testName);
    await admin`drop database if exists ${identifier} with (force)`;
    await admin`create database ${identifier}`;
  } finally {
    await admin.end();
  }
}

export async function recreateDatabase(urls: TestDatabaseUrls): Promise<void> {
  await createEmptyDatabase(urls);
  await runMigrations({
    url: urls.testUrl,
    migrationsFolder: "./drizzle",
    ownerEmail: TEST_OWNER_EMAIL,
  });
}
