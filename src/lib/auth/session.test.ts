import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { sessions, users } from "@/db/schema";

import { withRollback } from "../../../test/db";
import { createTestAuth, signInAs } from "../../../test/auth";

const DAY = 24 * 60 * 60;

const withCookie = (cookie: string) => new Headers({ cookie });

describe("Вход держится 30 дней с последнего захода", () => {
  it("Закрыла браузер и вернулась: next day she is still in", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      // A day has passed: the session was made yesterday
      await db.execute(sql`update sessions set
        created_at = now() - interval '1 day',
        updated_at = now() - interval '1 day',
        expires_at = now() + interval '29 days'`);

      const session = await auth.api.getSession({
        headers: withCookie(cookie),
      });

      expect(session?.user.email).toBe("anna@example.com");
    });
  });

  it("Не заходила больше 30 дней: an expired session is nobody", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      // The last visit was 31 days ago
      await db.execute(
        sql`update sessions set expires_at = now() - interval '1 day'`,
      );

      const session = await auth.api.getSession({
        headers: withCookie(cookie),
      });

      expect(session).toBeNull();
    });
  });

  it("Заход продлевает срок: after a day a visit moves the end to now + 30 days and renews the cookie", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      // The last move of the end was 2 days ago: 28 days are left
      await db.execute(
        sql`update sessions set expires_at = now() + interval '28 days'`,
      );

      const { headers, response } = await auth.api.getSession({
        headers: withCookie(cookie),
        returnHeaders: true,
      });

      expect(response?.user.email).toBe("anna@example.com");
      const [{ daysLeft }] = await db
        .select({
          daysLeft: sql<number>`round(extract(epoch from ${sessions.expiresAt} - now()) / ${DAY})::int`,
        })
        .from(sessions);
      expect(daysLeft).toBe(30);
      // The browser gets the new end too, or its cookie would run out
      // 30 days after the first sign-in
      const setCookie = headers.getSetCookie().join("\n");
      expect(setCookie).toContain("session_token=");
      expect(setCookie).toContain(`Max-Age=${30 * DAY}`);
    });
  });

  it("does not move the end on every visit: within a day nothing is written", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const cookie = await signInAs(db, auth, sent, "anna@example.com");
      await db.execute(
        sql`update sessions set expires_at = now() + interval '29 days 12 hours'`,
      );
      const [before] = await db.select().from(sessions);

      await auth.api.getSession({ headers: withCookie(cookie) });

      const [after] = await db.select().from(sessions);
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
    });
  });
});

describe("Несколько устройств сразу", () => {
  it("Два браузера: both sessions of one user work at once", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const first = await signInAs(db, auth, sent, "anna@example.com");
      const second = await signInAs(db, auth, sent, "anna@example.com");

      expect(first).not.toBe(second);
      const a = await auth.api.getSession({ headers: withCookie(first) });
      const b = await auth.api.getSession({ headers: withCookie(second) });
      expect(a?.user.id).toBeTruthy();
      expect(a?.user.id).toBe(b?.user.id);
      expect(await db.select().from(sessions)).toHaveLength(2);
      expect(
        await db
          .select()
          .from(users)
          .where(eq(users.email, "anna@example.com")),
      ).toHaveLength(1);
    });
  });
});

describe("Почта в шапке и выход", () => {
  it("Выход только на этом устройстве: signing out removes only this session", async () => {
    await withRollback(async (db) => {
      const { auth, sent } = createTestAuth(db);
      const first = await signInAs(db, auth, sent, "anna@example.com");
      const second = await signInAs(db, auth, sent, "anna@example.com");

      await auth.api.signOut({ headers: withCookie(first) });

      expect(
        await auth.api.getSession({ headers: withCookie(first) }),
      ).toBeNull();
      expect(
        (await auth.api.getSession({ headers: withCookie(second) }))?.user
          .email,
      ).toBe("anna@example.com");
      expect(await db.select().from(sessions)).toHaveLength(1);
    });
  });
});
