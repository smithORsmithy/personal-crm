import { afterEach, describe, expect, it, vi } from "vitest";

import { withRollback, withUnreachableDb } from "../../../test/db";
import {
  BASE_URL,
  cookieOf,
  createTestAuth,
  linkIn,
  linkKeyOf,
} from "../../../test/auth";
import { captureConsole, expectNoRequestValues } from "../../../test/console";

import { answerAuthRequest } from "./route-answer";
import { requestSignInLink } from "./sign-in-request";

const headers = new Headers({ "x-real-ip": "203.0.113.7" });

afterEach(() => {
  vi.restoreAllMocks();
});

// What the app answers under /api/auth: the sign-in library's own paths,
// such as opening the link from the email
describe("answerAuthRequest", () => {
  it("исправная ссылка впускает", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);

      const response = await answerAuthRequest(
        auth,
        new Request(linkIn(sent[0])),
      );

      expect(response.headers.get("location")).toBe(`${BASE_URL}/`);
      expect(cookieOf(response)).toContain("better-auth.session_token=");
    });
  });

  it("Открыть ссылку из письма при остановленной базе", async () => {
    // The link is asked for while the database is up
    let link = "";
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);
      link = linkIn(sent[0]);
    });

    await withUnreachableDb(async (db) => {
      const { auth } = createTestAuth(db);
      const log = captureConsole();

      const response = await answerAuthRequest(auth, new Request(link));

      // The same empty error as before: nobody is signed in
      expect(response.status).toBe(500);
      expect(cookieOf(response)).toBeNull();

      const text = log.text();
      expectNoRequestValues(text, [linkKeyOf(link), "anna@example.com"]);
      expect(text).toContain('from "verifications"');
      expect(text).toContain("$1");
      expect(text).toContain("$2");
      expect(text).toContain("ECONNREFUSED");
    });
  });
});
