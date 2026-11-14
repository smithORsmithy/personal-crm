import { afterEach, describe, expect, it, vi } from "vitest";

import { withRollback, withUnreachableDb } from "../../../test/db";
import { createTestAuth, sessionKeyOf, signInAs } from "../../../test/auth";
import { captureConsole, expectNoRequestValues } from "../../../test/console";

import { logAuthLibraryMessage } from "./library-log";

afterEach(() => {
  vi.restoreAllMocks();
});

// The sign-in library writes some errors to the log by itself
describe("журнал библиотеки входа", () => {
  it("Выйти при остановленной базе", async () => {
    // A real sign-in cookie, made while the database was up
    let cookie = "";
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      cookie = await signInAs(db, auth, sent, "anna@example.com");
    });

    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      const log = captureConsole();

      const { headers } = await auth.api.signOut({
        headers: new Headers({ cookie }),
        returnHeaders: true,
      });

      // Signed out on this device anyway: the cookie is wiped, so the next
      // page is the sign-in page
      const wiped = headers
        .getSetCookie()
        .find((line) => line.startsWith("better-auth.session_token="));
      expect(wiped).toMatch(/^better-auth\.session_token=;.*Max-Age=0/i);

      const text = log.text();
      expectNoRequestValues(text, [sessionKeyOf(cookie), "anna@example.com"]);
      expect(text).toContain('from "sessions"');
      expect(text).toContain("$1");
      expect(text).toContain("ECONNREFUSED");
    });
  });

  it("из сообщения пишется только первая строка", () => {
    const log = captureConsole();
    logAuthLibraryMessage(
      "error",
      'Failed query: select 1 where "email" = $1\nparams: anna@example.com',
    );
    const text = log.textOf("error");
    expect(text).toContain("[Better Auth]");
    expect(text).toContain('Failed query: select 1 where "email" = $1');
    expectNoRequestValues(text, ["anna@example.com"]);
  });

  it("приложенный объект, который не ошибка, не пишется", () => {
    const log = captureConsole();
    logAuthLibraryMessage("error", "Blocked request", {
      email: "anna@example.com",
    });
    expect(log.text()).toContain("Blocked request");
    expectNoRequestValues(log.text(), ["anna@example.com"]);
  });

  it("предупреждение идёт в console.warn", () => {
    const log = captureConsole();
    logAuthLibraryMessage("warn", "Secret is too short");
    expect(log.textOf("warn")).toContain("Secret is too short");
    expect(log.textOf("error")).toBe("");
  });
});
