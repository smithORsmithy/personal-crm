import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withRollback, withUnreachableDb } from "../../../test/db";
import {
  BASE_URL,
  createTestAuth,
  sessionKeyOf,
  signInAs,
} from "../../../test/auth";
import {
  captureConsole,
  expectNoRequestValues,
  printed,
} from "../../../test/console";

import { answerRequest } from "./proxy-answer";

// A failed database call is logged on purpose; keep the test output clean
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function page(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

// What a form sends: Next.js marks a server action with this header
function form(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "next-action": "0123abcd", ...(cookie ? { cookie } : {}) },
  });
}

// NextResponse.next(): the request goes on to the page or the action
const goesOn = (response: Response) =>
  response.headers.get("x-middleware-next") === "1";

async function signedInCookie(): Promise<string> {
  let cookie = "";
  await withRollback(async (db) => {
    const { auth, sent } = createTestAuth(db);
    cookie = await signInAs(db, auth, sent, "anna@example.com");
  });
  return cookie;
}

// The proxy runs before every page and action (src/proxy.ts)
describe("answerRequest", () => {
  it("Открыть приложение без входа: страница входа", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      const response = await answerRequest(auth, page("/"));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe(
        "/login",
      );
    });
  });

  it("Вошедший открывает страницу входа: список", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      const response = await answerRequest(auth, page("/login", cookie));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/");
    });
  });

  it("форма без входа проходит к действию, оно отвечает само", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      expect(goesOn(await answerRequest(auth, form("/contacts/new")))).toBe(
        true,
      );
    });
  });

  it("База данных недоступна при добавлении контакта с частотой: форма проходит к действию", async () => {
    const cookie = await signedInCookie();
    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      const response = await answerRequest(auth, form("/contacts/new", cookie));
      // The action itself shows «Не получилось сохранить…»
      expect(goesOn(response)).toBe(true);
    });
  });

  // A page cannot be shown without the database anyway: the error page,
  // as before
  it("страница при недоступной базе — ошибка", async () => {
    const cookie = await signedInCookie();
    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      await expect(
        answerRequest(auth, page("/contacts/new", cookie)),
      ).rejects.toThrow();
    });
  });

  // What Next.js prints about the error that left the proxy, and what the
  // proxy logs itself: no session key
  it("Открыть страницу при остановленной базе", async () => {
    const cookie = await signedInCookie();
    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      const log = captureConsole();

      const error = await answerRequest(auth, page("/", cookie)).then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Could not check who is signed in");
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
