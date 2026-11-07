import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "./index";

export type CurrentUser = { id: string; email: string };

// Who is signed in, from the session cookie of this very request. cache()
// reads it once per request, however many components ask. Only the id and
// the email leave this function: never the session itself.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // The request first: while the page is built (no request yet) this is where
  // it waits, before anything asks for the settings that exist only at run time
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session ? { id: session.user.id, email: session.user.email } : null;
});

// The id of the signed-in user, or a redirect to the sign-in page. Every
// page query and every server action starts with this: proxy.ts is only the
// first filter, the data is protected here. The id comes from the session
// and never from the browser.
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user.id;
}
