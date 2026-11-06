// Where the test database lives: the working database name plus "_test",
// on the same PostgreSQL. Tests never get the working database's address.

import { getDatabaseUrl, loadEnvFile } from "../src/db/url";

export const TEST_DB_SUFFIX = "_test";

export type TestDatabaseUrls = {
  // The working database: used only to drop and create the test one
  adminUrl: string;
  testUrl: string;
  testName: string;
};

export function getTestDatabaseUrls(): TestDatabaseUrls {
  loadEnvFile();
  const url = new URL(getDatabaseUrl());
  const adminUrl = url.toString();

  const workingName = decodeURIComponent(url.pathname.slice(1));
  const testName = workingName.endsWith(TEST_DB_SUFFIX)
    ? workingName
    : `${workingName}${TEST_DB_SUFFIX}`;
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
