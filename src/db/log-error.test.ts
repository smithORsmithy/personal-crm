import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureConsole, expectNoRequestValues } from "../../test/console";

import { logDbError } from "./log-error";

const QUERY = 'select "id" from "sessions" where "sessions"."token" = $1';
const KEY = "w0exxTMeo00QkAMwbOnhitWVivEvB8K1";

// The shape of a Drizzle query error made by another copy of drizzle-orm:
// Next.js puts one copy into each part of the build, while the connection to
// the database is one for the whole app, so its errors may come from a copy
// other than the one this file imports
class QueryErrorFromAnotherCopy extends Error {
  query: string;
  params: unknown[];
  constructor(query: string, params: unknown[], cause: unknown) {
    super(`Failed query: ${query}\nparams: ${params}`, { cause });
    this.query = query;
    this.params = params;
  }
}

const connectionError = () =>
  Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
    code: "ECONNREFUSED",
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logDbError", () => {
  it("ошибка запроса из другой копии drizzle-orm — с текстом запроса", () => {
    const log = captureConsole();
    // As the sign-in library hands it on: wrapped in its own error
    const error = new Error("Failed to get session", {
      cause: new QueryErrorFromAnotherCopy(QUERY, [KEY], connectionError()),
    });

    logDbError("Failed to check who is signed in", error);

    const text = log.text();
    expect(text).toContain("type: 'DrizzleQueryError'");
    expect(text).toContain(QUERY);
    expect(text).toContain("ECONNREFUSED");
    expectNoRequestValues(text, [KEY]);
  });

  it("настоящая ошибка запроса Drizzle — с текстом запроса", () => {
    const log = captureConsole();

    logDbError(
      "Failed to update contact",
      new DrizzleQueryError(QUERY, [KEY], connectionError()),
    );

    const text = log.text();
    expect(text).toContain("type: 'DrizzleQueryError'");
    expect(text).toContain(QUERY);
    expectNoRequestValues(text, [KEY]);
  });

  it("ошибка с текстом запроса, но без params — текст не пишется", () => {
    const log = captureConsole();
    // postgres.js keeps the values of a failed query in "parameters"
    const error = Object.assign(new Error("syntax error"), {
      query: `select '${KEY}'`,
      parameters: [KEY],
      code: "42601",
    });

    logDbError("Failed to add note", error);

    const text = log.text();
    expect(text).toContain("42601");
    expect(text).not.toContain("select");
    expectNoRequestValues(text, [KEY]);
  });
});
