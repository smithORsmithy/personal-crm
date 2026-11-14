// Who is asking, from the session cookie of a request. No "server-only" and
// no Next.js: tests run it on a real auth.
//
// When the database that keeps the sessions is down, the error of the
// sign-in library holds the failed query with its values, the session key
// among them. Next.js prints a thrown error whole, with its causes. So the
// error is logged here without the values, and what goes on is a plain
// error with nothing inside.

import { logDbError } from "@/db/log-error";

import type { Auth } from "./create-auth";

export type SignedInUser = { id: string; email: string };

export type SignedInCheck =
  | { status: "signed-in"; userId: string }
  | { status: "signed-out" }
  | { status: "unavailable" };

// What goes on to Next.js when the database cannot tell who is signed in
export function signInCheckFailed(error: unknown): Error {
  logDbError("Failed to check who is signed in", error);
  return new Error("Could not check who is signed in");
}

// For pages and actions (getCurrentUser): the user, or null when nobody is
// signed in. When the database is down, an error without the session key.
export async function readSignedInUser(
  auth: Auth,
  headers: Headers,
): Promise<SignedInUser | null> {
  let session;
  try {
    session = await auth.api.getSession({ headers });
  } catch (error) {
    throw signInCheckFailed(error);
  }
  return session ? { id: session.user.id, email: session.user.email } : null;
}

// For a server action that saves. Next to "signed in" and "not signed in"
// there is a third answer: "cannot tell", when the database is down. Then
// the action can show its usual «Не получилось сохранить…» and keep what was
// typed, instead of the error page.
export async function checkSignedInUser(
  auth: Auth,
  headers: Headers,
): Promise<SignedInCheck> {
  try {
    const session = await auth.api.getSession({ headers });
    return session
      ? { status: "signed-in", userId: session.user.id }
      : { status: "signed-out" };
  } catch (error) {
    logDbError("Failed to check who is signed in", error);
    return { status: "unavailable" };
  }
}
