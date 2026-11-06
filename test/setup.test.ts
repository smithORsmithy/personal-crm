import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contacts } from "../src/db/schema";

import { withRollback } from "./db";

describe("Test database", () => {
  it("has the contacts and notes tables", async () => {
    await withRollback(async (db) => {
      const rows = (await db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public'`,
      )) as unknown as { table_name: string }[];
      const names = rows.map((row) => row.table_name);
      expect(names).toContain("contacts");
      expect(names).toContain("notes");
    });
  });

  it("does not show data of a previous test: insert", async () => {
    await withRollback(async (db) => {
      await db.insert(contacts).values({ name: "Temp" });
      expect(await db.select().from(contacts)).toHaveLength(1);
    });
  });

  it("does not show data of a previous test: check", async () => {
    await withRollback(async (db) => {
      expect(await db.select().from(contacts)).toHaveLength(0);
    });
  });
});
