import { NextResponse, type NextRequest } from "next/server";

import { getProxyAuth } from "@/lib/auth";

// Runs before every page and action. Without a sign-in only the sign-in page
// opens; with a sign-in the sign-in page leads to the list. This is the
// first filter, not the protection of the data: every query asks for the
// user again (src/lib/auth/current-user.ts).
export async function proxy(request: NextRequest) {
  const { headers, response } = await getProxyAuth().api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

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

export const config = {
  matcher: [
    // Everything except: the sign-in library's own paths (opening the link),
    // the health check, the "Ссылка устарела" page, the build's files, and
    // files with an extension (icons, images)
    "/((?!api/auth|health|login/link-expired|_next/static|_next/image|.*\\..*).*)",
  ],
};
