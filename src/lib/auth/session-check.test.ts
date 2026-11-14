import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";

import { withRollback, withUnreachableDb } from "../../../test/db";
import { createTestAuth, sessionKeyOf, signInAs } from "../../../test/auth";
import {
  captureConsole,
  expectNoRequestValues,
  printed,
} from "../../../test/console";

import { checkSignedInUser, readSignedInUser } from "./session-check";

const withCookie = (cookie: string) => new Headers({ cookie });

// A failed database call is logged on purpose; keep the test output clean
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Who is asking, for an action that saves: signed in, not signed in, or
// "cannot tell" when the database is down. The last one lets the add form
// show «Не получилось сохранить…» instead of the error page.
describe("checkSignedInUser", () => {
  it("вошедший — его номер", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      const [anna] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "anna@example.com"));

      expect(await checkSignedInUser(auth, withCookie(cookie))).toEqual({
        status: "signed-in",
        userId: anna.id,
      });
    });
  });

  it("без входа — никто", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      expect(await checkSignedInUser(auth, new Headers())).toEqual({
        status: "signed-out",
      });
    });
  });

  it("База данных недоступна при добавлении контакта с частотой: вход не проверить", async () => {
    // A real sign-in cookie, made while the database was up
    let cookie = "";
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      cookie = await signInAs(db, auth, sent, "anna@example.com");
    });

    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      expect(await checkSignedInUser(auth, withCookie(cookie))).toEqual({
        status: "unavailable",
      });
    });
  });
});

// Who is signed in, for pages and actions (getCurrentUser). When the
// database is down the page shows the error page; what Next.js then prints
// about the error must not carry the session key.
describe("readSignedInUser", () => {
  it("вошедший — его номер и почта", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      const [anna] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "anna@example.com"));

      expect(await readSignedInUser(auth, withCookie(cookie))).toEqual({
        id: anna.id,
        email: "anna@example.com",
      });
    });
  });

  it("без входа — никто", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      expect(await readSignedInUser(auth, new Headers())).toBeNull();
    });
  });

  it("Открыть страницу при остановленной базе", async () => {
    let cookie = "";
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      cookie = await signInAs(db, auth, sent, "anna@example.com");
    });

    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      const log = captureConsole();

      const error = await readSignedInUser(auth, withCookie(cookie)).then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Could not check who is signed in");
      // What Next.js prints about the error that left the page
      const values = [sessionKeyOf(cookie), "anna@example.com"];
      expectNoRequestValues(printed(error), values);

      const text = log.text();
      expectNoRequestValues(text, values);
      expect(text).toContain('from "sessions"');
      expect(text).toContain("$1");
      expect(text).toContain("ECONNREFUSED");
    });
  });
});
