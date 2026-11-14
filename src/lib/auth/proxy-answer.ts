// What the proxy (src/proxy.ts) answers before every page and action.
// Without a sign-in only the sign-in page opens; with a sign-in the sign-in
// page leads to the list. This is the first filter, not the protection of
// the data: every query asks for the user again (current-user.ts).
// No Next.js settings here: tests run it on a real auth.

import { NextResponse, type NextRequest } from "next/server";

import type { Auth } from "./create-auth";
import { signInCheckFailed } from "./session-check";

export async function answerRequest(
  auth: Auth,
  request: NextRequest,
): Promise<NextResponse> {
  let session;
  try {
    session = await auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
  } catch (error) {
    // The database is down and cannot tell who is signed in. A form goes on
    // to its action, which shows its own «Не получилось сохранить…» and
    // keeps what was typed. A page needs the data anyway: the error page,
    // with an error that does not carry the session key (session-check.ts).
    if (isServerAction(request)) {
      return NextResponse.next();
    }
    throw signInCheckFailed(error);
  }
  const { headers, response } = session;

  const path = request.nextUrl.pathname;
  let answer = NextResponse.next();
  // A form can come from a tab opened before signing in or out in another
  // tab. Such a page cannot follow a plain redirect and shows the error page,
  // so forms are let through and the action answers itself: without a
  // sign-in it leads to the sign-in page (requireUserId), the sign-in form of
  // a signed-in user leads to the list (requestSignInLinkAction).
  if (!isServerAction(request)) {
    if (!response && path !== "/login") {
      answer = redirectTo(request, "/login");
    } else if (response && path === "/login") {
      answer = redirectTo(request, "/");
    }
  }

  // Better Auth moves the end of a sign-in ahead once a day. Pages cannot
  // set cookies, so the browser gets the renewed cookie here; otherwise only
  // the record in the database would be renewed and the cookie would run out
  // 30 days after the first sign-in. A sign-in that has ended is cleared the
  // same way.
  for (const cookie of headers.getSetCookie()) {
    answer.headers.append("set-cookie", cookie);
  }
  return answer;
}

// Next.js sends a server action as a POST with this header
function isServerAction(request: NextRequest): boolean {
  return request.method === "POST" && request.headers.has("next-action");
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return NextResponse.redirect(url);
}
