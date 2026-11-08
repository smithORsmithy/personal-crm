import type { NextRequest } from "next/server";

import { getProxyAuth } from "@/lib/auth";
import { answerRequest } from "@/lib/auth/proxy-answer";

// Runs before every page and action: what it answers is in
// src/lib/auth/proxy-answer.ts
export async function proxy(request: NextRequest) {
  return answerRequest(getProxyAuth(), request);
}

export const config = {
  matcher: [
    // Everything except: the sign-in library's own paths (opening the link),
    // the health check, the "Ссылка устарела" page, the build's files, and
    // files with an extension (icons, images)
    "/((?!api/auth|health|login/link-expired|_next/static|_next/image|.*\\..*).*)",
  ],
};
