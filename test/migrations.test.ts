// Migrations on data that already exists: what happens to the contacts, notes
// and groups that were there before sign-in appeared. Runs on a database of
// its own, which every test drops and creates again.

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../scripts/migrate-run";

import { createEmptyDatabase } from "./recreate-db";
import { getMigrationTestDatabaseUrls } from "./test-url";

const urls = getMigrationTestDatabaseUrls();
const OWNER = "owner@example.test";
const folders: string[] = [];

// A copy of ./drizzle that stops at the given migration: the database as it
// was before the later ones
function migrationsUpTo(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), "crm-migrations-"));
  folders.push(folder);
  mkdirSync(join(folder, "meta"));
  const journal = JSON.parse(
    readFileSync("./drizzle/meta/_journal.json", "utf8"),
  );
  const last = journal.entries.findIndex(
    (entry: { tag: string }) => entry.tag === lastTag,
  );
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    cpSync(`./drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
  }
  return folder;
}

async function withDatabase<T>(
  body: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(urls.testUrl, { max: 1, onnotice: () => {} });
  try {
    return await body(sql);
  } finally {
    await sql.end();
  }
}

const count = async (sql: postgres.Sql, table: string) =>
  (await sql.unsafe(`select count(*)::int as n from ${table}`))[0].n as number;

// The database as it was before sign-in: five initial groups, own groups,
// contacts with notes, people in groups
async function fillOldData(sql: postgres.Sql) {
  await sql`insert into groups (name) values ('Йога'), ('Работа')`;
  await sql`insert into contacts (name) values ('Анна Петрова'), ('Борис Орлов'), ('Вера Светлова')`;
  await sql`insert into notes (contact_id, body)
    select id, 'Созвонились' from contacts where name <> 'Вера Светлова'`;
  await sql`insert into contact_groups (contact_id, group_id)
    select c.id, g.id from contacts c, groups g
    where (c.name = 'Анна Петрова' and g.name in ('Йога', 'Друзья'))
       or (c.name = 'Борис Орлов' and g.name = 'Работа')`;
}

beforeEach(async () => {
  await createEmptyDatabase(urls);
});

afterAll(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("Владелец входит после обновления", () => {
  it("hands every contact and group to the owner and loses nothing", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: migrationsUpTo("0004_groups_presets"),
    });
    await withDatabase(fillOldData);
    const before = await withDatabase(async (sql) => ({
      contacts: await count(sql, "contacts"),
      notes: await count(sql, "notes"),
      groups: await count(sql, "groups"),
      links: await count(sql, "contact_groups"),
    }));
    expect(before).toEqual({ contacts: 3, notes: 2, groups: 7, links: 3 });

    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: "./drizzle",
      ownerEmail: "  Owner@Example.TEST ",
    });

    await withDatabase(async (sql) => {
      expect({
        contacts: await count(sql, "contacts"),
        notes: await count(sql, "notes"),
        groups: await count(sql, "groups"),
        links: await count(sql, "contact_groups"),
      }).toEqual(before);

      const users = await sql`select id, email, email_verified from users`;
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe(OWNER);
      expect(users[0].email_verified).toBe(true);

      const ownerId = users[0].id;
      expect(
        await sql`select id from contacts where owner_id is distinct from ${ownerId}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from groups where owner_id is distinct from ${ownerId}`,
      ).toHaveLength(0);
    });
  });

  it("Пять групп после обновления: the owner has the five initial groups", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: "./drizzle",
      ownerEmail: OWNER,
    });
    await withDatabase(async (sql) => {
      const names = await sql`
        select g.name from groups g join users u on u.id = g.owner_id
        where u.email = ${OWNER} order by g.name collate "ru-x-icu"`;
      expect(names.map((row) => row.name)).toEqual([
        "Аналитики",
        "Друзья",
        "Знакомые",
        "Семья",
        "Теннис",
      ]);
    });
  });

  it("uses the user that already exists with the owner's email", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: migrationsUpTo("0005_users"),
    });
    await withDatabase(async (sql) => {
      await sql`insert into users (id, name, email, email_verified)
        values ('u-existing', '', ${OWNER}, true)`;
    });

    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: "./drizzle",
      ownerEmail: OWNER,
    });

    await withDatabase(async (sql) => {
      expect(await count(sql, "users")).toBe(1);
      expect(
        await sql`select id from groups where owner_id = 'u-existing'`,
      ).toHaveLength(5);
    });
  });
});

describe("Настройки OWNER_EMAIL нет", () => {
  it("refuses to migrate data without an owner and leaves the database as it was", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: migrationsUpTo("0004_groups_presets"),
    });
    await withDatabase(fillOldData);

    await expect(
      runMigrations({ url: urls.testUrl, migrationsFolder: "./drizzle" }),
    ).rejects.toThrow(/OWNER_EMAIL is not set/);

    await withDatabase(async (sql) => {
      // Still at the step before: no users table, the data is as it was,
      // and not one of the later migrations is recorded
      const tables = await sql`select to_regclass('public.users') as users`;
      expect(tables[0].users).toBeNull();
      expect(await count(sql, "contacts")).toBe(3);
      expect(await count(sql, "notes")).toBe(2);
      expect(await count(sql, "groups")).toBe(7);
      expect(await count(sql, "drizzle.__drizzle_migrations")).toBe(5);
    });
  });

  it("also refuses on an empty database: the initial groups need an owner", async () => {
    await expect(
      runMigrations({ url: urls.testUrl, migrationsFolder: "./drizzle" }),
    ).rejects.toThrow(/OWNER_EMAIL is not set/);
  });

  it("refuses a wrong OWNER_EMAIL before any migration", async () => {
    await expect(
      runMigrations({
        url: urls.testUrl,
        migrationsFolder: "./drizzle",
        ownerEmail: "owner@",
      }),
    ).rejects.toThrow(/OWNER_EMAIL is not a valid email/);

    await withDatabase(async (sql) => {
      const tables =
        await sql`select to_regclass('drizzle.__drizzle_migrations') as t`;
      expect(tables[0].t).toBeNull();
    });
  });
});

describe("Другой пользователь после обновления", () => {
  it("gets an empty list of contacts and groups", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: "./drizzle",
      ownerEmail: OWNER,
    });
    await withDatabase(async (sql) => {
      await sql`insert into users (id, name, email, email_verified)
        values ('u-friend', '', 'friend@example.test', true)`;
      expect(
        await sql`select id from contacts where owner_id = 'u-friend'`,
      ).toHaveLength(0);
      expect(
        await sql`select id from groups where owner_id = 'u-friend'`,
      ).toHaveLength(0);
    });
  });
});

describe("Владелец обязателен", () => {
  it("does not save a contact or a group without an owner", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: "./drizzle",
      ownerEmail: OWNER,
    });
    await withDatabase(async (sql) => {
      await expect(
        sql`insert into contacts (name) values ('Без владельца')`,
      ).rejects.toThrow(/owner_id/);
      await expect(
        sql`insert into groups (name) values ('Без владельца')`,
      ).rejects.toThrow(/owner_id/);
    });
  });
});

describe("Такая же группа у другого пользователя", () => {
  it("allows the same group name for two users but not twice for one", async () => {
    await runMigrations({
      url: urls.testUrl,
      migrationsFolder: "./drizzle",
      ownerEmail: OWNER,
    });
    await withDatabase(async (sql) => {
      await sql`insert into users (id, name, email, email_verified)
        values ('u-friend', '', 'friend@example.test', true)`;
      // «Друзья» is the owner's already; the friend takes the same name
      await sql`insert into groups (owner_id, name) values ('u-friend', 'Друзья')`;
      await expect(
        sql`insert into groups (owner_id, name) values ('u-friend', 'друзья')`,
      ).rejects.toThrow(/groups_owner_id_name_lower_idx/);
    });
  });
});
