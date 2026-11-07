// Runs once before all unit tests: an empty test database with every
// migration applied.

import { recreateDatabase } from "./recreate-db";
import { getTestDatabaseUrls } from "./test-url";

export default async function setup() {
  await recreateDatabase(getTestDatabaseUrls());
}
