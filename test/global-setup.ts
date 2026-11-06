// Runs once before all tests: drops and recreates the test database and
// applies every migration to it. This also proves the migrations work on
// an empty database.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { assertTestDatabaseName, getTestDatabaseUrls } from "./test-url";

export default async function setup() {
  const { adminUrl, testUrl, testName } = getTestDatabaseUrls();
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

  const client = postgres(testUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

