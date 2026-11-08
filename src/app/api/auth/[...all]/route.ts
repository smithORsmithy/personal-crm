import { connection } from "next/server";

import { getAuth } from "@/lib/auth";

// The sign-in library answers everything under /api/auth: opening the link
// from the email, signing out. Asking for a link is not here: it goes only
// through the form's server action (see create-auth.ts, disabledPaths).
// getAuth() is called inside the functions, not at the top of the file: the
// settings are read where the app runs, not during `next build`.
export async function GET(request: Request) {
  await connection();
  return getAuth().handler(request);
}

export async function POST(request: Request) {
  return getAuth().handler(request);
}
