// "Получить ссылку": the step between the sign-in form and the sign-in
// library. Checks the email, counts the limit of emails, asks the library to
// make and send the link. Knows nothing about Next.js, so tests run it on
// the real test database. The answer is the same for a new email and for one
// that signed in before: nobody can tell who has an account.

import { and, eq, gt, lte, sql } from "drizzle-orm";

import { logDbError } from "@/db/log-error";
import { signInEmails } from "@/db/schema";
import type { Database } from "@/db/types";

import type { Auth } from "./create-auth";
import { normalizeEmail } from "./email";

// No more than this many emails to one address in this many minutes
export const EMAILS_PER_WINDOW = 3;
export const WINDOW_MINUTES = 10;

export type SignInRequestResult =
  | { status: "sent"; email: string }
  // The address is empty or wrong: no email goes out
  | { status: "invalid" }
  // The limit is used up: no email goes out
  | { status: "too-many" }
  // The mail service did not take the email
  | { status: "failed" };

const windowStart = sql`now() - interval '1 minute' * ${WINDOW_MINUTES}`;

export async function requestSignInLink(
  db: Database,
  auth: Auth,
  rawEmail: unknown,
  headers: Headers,
): Promise<SignInRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return { status: "invalid" };
  }

  const placeId = await takePlaceInLimit(db, email);
  if (placeId === null) {
    return { status: "too-many" };
  }

  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: "/",
        newUserCallbackURL: "/",
        errorCallbackURL: "/login/link-expired",
      },
      headers,
    });
  } catch (error) {
    // The limit counts sent emails only: give the place back
    logDbError("Failed to send the sign-in email", error);
    await db.delete(signInEmails).where(eq(signInEmails.id, placeId));
    return { status: "failed" };
  }
  return { status: "sent", email };
}

// Counts the emails of this address in the last minutes and, if there is
// room, writes one more. Returns its id, or null when the limit is used up.
// Two requests of one address at the same moment go one after the other:
// the lock is held until the end of the transaction.
async function takePlaceInLimit(
  db: Database,
  email: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

    const [{ sent }] = await tx
      .select({ sent: sql<number>`count(*)::int` })
      .from(signInEmails)
      .where(
        and(
          eq(signInEmails.email, email),
          gt(signInEmails.sentAt, windowStart),
        ),
      );
    if (sent >= EMAILS_PER_WINDOW) {
      return null;
    }

    // Old records are of no use: clear them so the table does not grow
    await tx.delete(signInEmails).where(lte(signInEmails.sentAt, windowStart));
    const [place] = await tx
      .insert(signInEmails)
      .values({ email })
      .returning({ id: signInEmails.id });
    return place.id;
  });
}
