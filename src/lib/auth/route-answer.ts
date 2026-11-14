// What the app answers under /api/auth: the sign-in library's own paths,
// such as opening the link from the email. No Next.js here: tests run it on
// a real auth.

import { logDbError } from "@/db/log-error";

import type { Auth } from "./create-auth";

// The library is set to hand an unexpected error over (onAPIError.throw in
// create-auth.ts) instead of printing it whole with the values of the failed
// query, such as the key of the link. It is logged here without them, and
// the answer is the same empty 500 the library gave before. The library's
// own answers (a used link, a redirect) are not errors and pass as they are.
export async function answerAuthRequest(
  auth: Auth,
  request: Request,
): Promise<Response> {
  try {
    return await auth.handler(request);
  } catch (error) {
    logDbError("Sign-in library request failed", error);
    return new Response(null, {
      status: 500,
      statusText: "Internal Server Error",
    });
  }
}
