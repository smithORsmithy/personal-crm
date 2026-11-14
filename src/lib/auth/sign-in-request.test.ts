import nodemailer from "nodemailer";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { signInEmails, users, verifications } from "@/db/schema";
import type { Database } from "@/db/types";

import { withRollback, withUnreachableDb } from "../../../test/db";
import {
  captureConsole,
  expectNoRequestValues,
  printed,
} from "../../../test/console";
import { createTestAuth, linkIn, openLink, BASE_URL } from "../../../test/auth";
import { getTestDatabaseUrls } from "../../../test/test-url";

import { createAuth } from "./create-auth";
import { requestSignInLink } from "./sign-in-request";

// What the browser sends along; the address is the one nginx would put there
const headers = new Headers({ "x-real-ip": "203.0.113.7" });

describe("Запрос ссылки для входа", () => {
  it("Получить ссылку: an email goes to the address with the sign-in link", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);

      const result = await requestSignInLink(
        db,
        auth,
        "anna@example.com",
        headers,
      );

      expect(result).toEqual({ status: "sent", email: "anna@example.com" });
      expect(sent).toHaveLength(1);
      expect(sent[0].to[0].address).toBe("anna@example.com");
      expect(sent[0].subject).toBe("Вход в Личную CRM");
      expect(linkIn(sent[0])).toContain(
        `${BASE_URL}/api/auth/magic-link/verify`,
      );
    });
  });

  it("Новая и знакомая почта — одинаково", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      // anna has signed in before, boris never
      await requestSignInLink(db, auth, "anna@example.com", headers);
      await openLink(auth, linkIn(sent[0]));
      sent.length = 0;

      const known = await requestSignInLink(
        db,
        auth,
        "anna@example.com",
        headers,
      );
      const fresh = await requestSignInLink(
        db,
        auth,
        "boris@example.com",
        headers,
      );

      expect(known).toEqual({ status: "sent", email: "anna@example.com" });
      expect(fresh).toEqual({ status: "sent", email: "boris@example.com" });
      expect(sent.map((mail) => mail.to[0].address)).toEqual([
        "anna@example.com",
        "boris@example.com",
      ]);
      // Asking for a link created nobody: boris is only born when he opens it
      const found = await db
        .select()
        .from(users)
        .where(eq(users.email, "boris@example.com"));
      expect(found).toHaveLength(0);
    });
  });

  it("Почта с пробелами и большими буквами", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);

      const result = await requestSignInLink(
        db,
        auth,
        "  Anna@Example.COM  ",
        headers,
      );

      expect(result).toEqual({ status: "sent", email: "anna@example.com" });
      expect(sent[0].to[0].address).toBe("anna@example.com");
    });
  });

  it("Неверная почта в форме: no email, no place taken in the limit", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);

      for (const wrong of ["anna@", "", "   ", "anna", undefined, 42]) {
        expect(await requestSignInLink(db, auth, wrong, headers)).toEqual({
          status: "invalid",
        });
      }

      expect(sent).toHaveLength(0);
      expect(await db.select().from(signInEmails)).toHaveLength(0);
      expect(await db.select().from(verifications)).toHaveLength(0);
    });
  });
});

describe("Вход по ссылке из письма", () => {
  it("Войти по ссылке: the link lets the person in and opens the list", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);

      const opened = await openLink(auth, linkIn(sent[0]));

      expect(opened.location).toBe(`${BASE_URL}/`);
      expect(opened.cookie).toContain("session_token=");
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: opened.cookie! }),
      });
      expect(session?.user.email).toBe("anna@example.com");
    });
  });

  it("Первый вход новой почты: the user is born when the link is opened, with an empty name", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "boris@example.com", headers);
      expect(
        await db
          .select()
          .from(users)
          .where(eq(users.email, "boris@example.com")),
      ).toHaveLength(0);

      const opened = await openLink(auth, linkIn(sent[0]));

      const [boris] = await db
        .select()
        .from(users)
        .where(eq(users.email, "boris@example.com"));
      expect(boris.name).toBe("");
      expect(boris.emailVerified).toBe(true);
      // Straight in: the list, not a sign-up form
      expect(opened.location).toBe(`${BASE_URL}/`);
      expect(opened.cookie).toContain("session_token=");
    });
  });

  it("Тот же пользователь при другом написании почты", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "Anna@Example.com", headers);
      const first = await openLink(auth, linkIn(sent[0]));
      await requestSignInLink(db, auth, "anna@example.com", headers);
      const second = await openLink(auth, linkIn(sent[1]));

      const sessionOf = async (cookie: string | null) =>
        (
          await auth.api.getSession({
            headers: new Headers({ cookie: cookie! }),
          })
        )?.user.id;
      expect(await sessionOf(first.cookie)).toBeTruthy();
      expect(await sessionOf(first.cookie)).toBe(
        await sessionOf(second.cookie),
      );
      expect(
        await db
          .select()
          .from(users)
          .where(eq(users.email, "anna@example.com")),
      ).toHaveLength(1);
    });
  });

  it("Ссылку открыли второй раз: the second visit shows «устарела» and does not let in", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);
      const link = linkIn(sent[0]);
      await openLink(auth, link);

      const again = await openLink(auth, link);

      expect(again.location).toContain("/login/link-expired");
      expect(again.cookie).toBeNull();
    });
  });

  it("Прошло больше 15 минут: the link lives 15 minutes", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);

      const [row] = await db
        .select({
          lifetimeSeconds: sql<number>`extract(epoch from ${verifications.expiresAt} - ${verifications.createdAt})::int`,
        })
        .from(verifications);
      expect(row.lifetimeSeconds).toBe(15 * 60);

      // 16 minutes later: the stored end of its life is in the past
      await db
        .update(verifications)
        .set({ expiresAt: sql`now() - interval '1 minute'` });
      const opened = await openLink(auth, linkIn(sent[0]));

      expect(opened.location).toContain("/login/link-expired");
      expect(opened.cookie).toBeNull();
    });
  });
});

describe("Новая ссылка отменяет прежние", () => {
  it("Запросила ссылку дважды: only the last link works", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);
      await requestSignInLink(db, auth, "anna@example.com", headers);

      const first = await openLink(auth, linkIn(sent[0]));
      expect(first.location).toContain("/login/link-expired");
      expect(first.cookie).toBeNull();

      const second = await openLink(auth, linkIn(sent[1]));
      expect(second.location).toBe(`${BASE_URL}/`);
      expect(second.cookie).toContain("session_token=");
    });
  });

  it("leaves the links of other emails alone", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      await requestSignInLink(db, auth, "anna@example.com", headers);
      await requestSignInLink(db, auth, "boris@example.com", headers);
      await requestSignInLink(db, auth, "anna@example.com", headers);

      const boris = await openLink(auth, linkIn(sent[1]));

      expect(boris.location).toBe(`${BASE_URL}/`);
    });
  });
});

describe("Не больше 3 писем на одну почту за 10 минут", () => {
  const ask = (
    db: Database,
    auth: ReturnType<typeof createAuth>,
    email: string,
  ) => requestSignInLink(db, auth, email, headers);

  it("Четвёртый запрос за 10 минут: «too-many» and no fourth email", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      for (let i = 0; i < 3; i++) {
        expect((await ask(db, auth, "anna@example.com")).status).toBe("sent");
      }

      expect(await ask(db, auth, "anna@example.com")).toEqual({
        status: "too-many",
      });
      expect(sent).toHaveLength(3);
    });
  });

  it("counts the same email written differently as one", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      await ask(db, auth, "anna@example.com");
      await ask(db, auth, "ANNA@example.com");
      await ask(db, auth, " anna@Example.com ");

      expect((await ask(db, auth, "Anna@EXAMPLE.com")).status).toBe("too-many");
    });
  });

  it("Через 10 минут снова можно", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      for (let i = 0; i < 3; i++) {
        await ask(db, auth, "anna@example.com");
      }
      // The first of the three went out 11 minutes ago
      await db.execute(sql`update sign_in_emails set sent_at = now() - interval '11 minutes'
        where id = (select min(id) from sign_in_emails)`);

      expect(await ask(db, auth, "anna@example.com")).toEqual({
        status: "sent",
        email: "anna@example.com",
      });
      expect(sent).toHaveLength(4);
    });
  });

  it("Другая почта не затронута", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      for (let i = 0; i < 3; i++) {
        await ask(db, auth, "anna@example.com");
      }
      expect((await ask(db, auth, "anna@example.com")).status).toBe("too-many");

      expect(await ask(db, auth, "boris@example.com")).toEqual({
        status: "sent",
        email: "boris@example.com",
      });
    });
  });

  it("does not count a refusal: a wrong address and «too-many» take no place", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      await ask(db, auth, "anna@");
      for (let i = 0; i < 3; i++) {
        await ask(db, auth, "anna@example.com");
      }
      await ask(db, auth, "anna@example.com");

      expect(await db.select().from(signInEmails)).toHaveLength(3);
    });
  });

  it("clears old records of the limit so the table does not grow", async () => {
    await withRollback(async (db) => {
      const { auth } = createTestAuth(db);
      await db.insert(signInEmails).values({
        email: "someone@example.com",
        sentAt: sql`now() - interval '1 hour'`,
      });

      await ask(db, auth, "anna@example.com");

      const rows = await db.select().from(signInEmails);
      expect(rows.map((row) => row.email)).toEqual(["anna@example.com"]);
    });
  });

  it("Ошибка отправки: the mail server does not answer, «failed» and the place in the limit is free", async () => {
    await withRollback(async (db) => {
      // A real connection error: nothing listens on port 1
      const broken = nodemailer.createTransport("smtp://127.0.0.1:1");
      const { auth } = createTestAuth(db, broken);

      expect(await ask(db, auth, "anna@example.com")).toEqual({
        status: "failed",
      });
      expect(await db.select().from(signInEmails)).toHaveLength(0);
    });
  });

  it("two requests at the same moment with two letters already sent: only one passes", async () => {
    // Needs two connections at once, so no rolled-back transaction here:
    // the rows are removed by hand at the end
    const url = getTestDatabaseUrls().testUrl;
    const clients = [postgres(url, { max: 1 }), postgres(url, { max: 1 })];
    const email = "race-anna@example.com";
    try {
      const [dbA, dbB] = clients.map(
        (client) => drizzle(client, { schema }) as unknown as Database,
      );
      const a = createTestAuth(dbA);
      const b = createTestAuth(dbB);
      await ask(dbA, a.auth, email);
      await ask(dbA, a.auth, email);

      const results = await Promise.all([
        ask(dbA, a.auth, email),
        ask(dbB, b.auth, email),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        "sent",
        "too-many",
      ]);
    } finally {
      const [client] = clients;
      await client`delete from sign_in_emails where email = ${email}`;
      await client`delete from verifications where value like ${"%" + email + "%"}`;
      await Promise.all(clients.map((client) => client.end()));
    }
  });
});

// The form shows the error page, as before; what is logged about it, and
// what Next.js prints about the error that left the form, has no email
describe("Запросить ссылку при остановленной базе", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function failedRequest(db: Database) {
    const { auth } = createTestAuth(db);
    const log = captureConsole();
    const error = await requestSignInLink(
      db,
      auth,
      "anna@example.com",
      headers,
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    return { error, text: log.text() };
  }

  it("база не отвечает", async () => {
    await withUnreachableDb(async (db) => {
      const { error, text } = await failedRequest(db);

      expect(error).toBeInstanceOf(Error);
      expectNoRequestValues(printed(error), ["anna@example.com"]);
      expectNoRequestValues(text, ["anna@example.com"]);
      expect(text).toContain("ECONNREFUSED");
    });
  });

  it("запрос к базе упал", async () => {
    await withRollback(async (db) => {
      // The count of emails fails while the database answers: its values
      // (the email) are in the error of the query. Rolled back after the test.
      await db.execute(sql`drop table sign_in_emails`);

      const { error, text } = await failedRequest(db);

      expect(error).toBeInstanceOf(Error);
      expectNoRequestValues(printed(error), ["anna@example.com"]);
      expectNoRequestValues(text, ["anna@example.com"]);
      expect(text).toContain('from "sign_in_emails"');
      expect(text).toContain("$1");
    });
  });
});
