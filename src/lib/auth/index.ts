import "server-only";

import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/db";

import { createAuth, type Auth } from "./create-auth";
import { createMailer } from "./mail";

function setting(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Only the name: the settings may hold secrets
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Kept on globalThis so that hot reloads in development reuse one instance
const globalForAuth = globalThis as unknown as {
  auth?: Auth;
  proxyAuth?: Auth;
};

function build(plugins: Parameters<typeof createAuth>[0]["plugins"]): Auth {
  return createAuth({
    db: getDb(),
    mailer: createMailer(setting("SMTP_URL")),
    from: setting("MAIL_FROM"),
    baseURL: setting("BETTER_AUTH_URL"),
    secret: setting("BETTER_AUTH_SECRET"),
    plugins,
  });
}

// Built on the first call, not when this file loads: `next build` loads
// every file, but the settings of sign-in exist only where the app runs
// (see getDb() in src/db/index.ts).
export function getAuth(): Auth {
  // nextCookies lets server actions set and clear the cookie; it has to be
  // the last plugin
  globalForAuth.auth ??= build([nextCookies()]);
  return globalForAuth.auth;
}

// For proxy.ts, which hands the cookies to the browser by itself: Next.js
// does not let the proxy write them through next/headers
export function getProxyAuth(): Auth {
  globalForAuth.proxyAuth ??= build([]);
  return globalForAuth.proxyAuth;
}
