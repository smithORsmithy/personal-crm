// Where the test databases live, on the same PostgreSQL as the working one:
// - unit tests (Vitest): the working database name plus "_test"
// - e2e tests (Playwright): the working database name plus "_e2e_test"
// Tests never get the working database's address.

import { getDatabaseUrl, loadEnvFile } from "../src/db/url";

export const TEST_DB_SUFFIX = "_test";
export const E2E_DB_SUFFIX = "_e2e_test";
export const MIGRATION_DB_SUFFIX = "_migration_test";

export type TestDatabaseUrls = {
  // The working database: used only to drop and create the test one
  adminUrl: string;
  testUrl: string;
  testName: string;
};

export function getTestDatabaseUrls(): TestDatabaseUrls {
  return testDatabaseUrls(TEST_DB_SUFFIX);
}

// A database of its own for e2e: the app writes to it for real, and the
// unit tests can run at the same time without seeing that data
export function getE2eDatabaseUrls(): TestDatabaseUrls {
  return testDatabaseUrls(E2E_DB_SUFFIX);
}

// A database of its own for the test of migrations on existing data: the
// test drops and creates it again by itself
export function getMigrationTestDatabaseUrls(): TestDatabaseUrls {
  return testDatabaseUrls(MIGRATION_DB_SUFFIX);
}

function testDatabaseUrls(suffix: string): TestDatabaseUrls {
  loadEnvFile();
  const url = new URL(getDatabaseUrl());
  const adminUrl = url.toString();

  const workingName = decodeURIComponent(url.pathname.slice(1));
  const testName = workingName.endsWith(suffix)
    ? workingName
    : `${workingName}${suffix}`;
  assertTestDatabaseName(testName);

  url.pathname = `/${encodeURIComponent(testName)}`;
  return { adminUrl, testUrl: url.toString(), testName };
}

// The last guard before anything is dropped
export function assertTestDatabaseName(name: string): void {
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `Refusing to touch database "${name}": a test database name must end with "${TEST_DB_SUFFIX}"`,
    );
  }
}

// An address with nothing listening, for "database is down" scenarios:
// a real connection error, no mocks
export function getUnreachableDatabaseUrl(): string {
  const url = new URL(getTestDatabaseUrls().testUrl);
  url.hostname = "127.0.0.1";
  url.port = "1";
  return url.toString();
}
