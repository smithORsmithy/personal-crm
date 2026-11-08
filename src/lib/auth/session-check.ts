// Who is asking, for a server action that saves. Next to "signed in" and
// "not signed in" there is a third answer: "cannot tell", when the database
// that keeps the sessions is down. Then the action can show its usual
// «Не получилось сохранить…» and keep what was typed, instead of the error
// page. No "server-only" and no Next.js: tests run it on a real auth.

import { logDbError } from "@/db/log-error";

import type { Auth } from "./create-auth";

export type SignedInCheck =
  | { status: "signed-in"; userId: string }
  | { status: "signed-out" }
  | { status: "unavailable" };

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
