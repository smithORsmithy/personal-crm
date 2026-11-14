// Builds Better Auth (the sign-in library) from plain parts: the database,
// the mailer and the settings. No Next.js in here, so tests build it on the
// test database; the app builds it in index.ts from the real settings.

import { and, like, ne, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import type Mail from "nodemailer/lib/mailer";

import * as schema from "@/db/schema";
import { verifications } from "@/db/schema";
import type { Database } from "@/db/types";

import { logAuthLibraryMessage } from "./library-log";
import { buildSignInEmail, SIGN_IN_LINK_MINUTES } from "./mail";

const DAY_SECONDS = 24 * 60 * 60;

// Signed in for 30 days, counted from the last visit: the end moves ahead by
// 30 days when more than a day has passed since the last move. So a visit
// never keeps the sign-in for less than 29 days.
export const SESSION_LIFETIME_SECONDS = 30 * DAY_SECONDS;
export const SESSION_REFRESH_AFTER_SECONDS = DAY_SECONDS;

export type AuthOptions = {
  db: Database;
  // Only sendMail is used: the real Nodemailer transport or a test double
  mailer: Pick<Mail, "sendMail">;
  // "Личная CRM" <noreply@mail.crm.linkbook.site>
  from: string;
  // The address of the site, for the links in emails and for cookies
  baseURL: string;
  secret: string;
  // Added after the library's own plugins (Next.js cookies must come last)
  plugins?: Parameters<typeof betterAuth>[0]["plugins"];
};

export function createAuth({
  db,
  mailer,
  from,
  baseURL,
  secret,
  plugins = [],
}: AuthOptions) {
  return betterAuth({
    baseURL,
    secret,
    // Tables are plural like the rest of the project: users, sessions, ...
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    session: {
      expiresIn: SESSION_LIFETIME_SECONDS,
      updateAge: SESSION_REFRESH_AFTER_SECONDS,
    },
    // A link can be asked for only by the form's server action (see
    // sign-in-request.ts), where the email is checked, the limit is counted
    // and old links are cancelled. Over the network this path does not exist.
    // Calls from the server code (auth.api.signInMagicLink) still work.
    disabledPaths: ["/sign-in/magic-link"],
    advanced: {
      // The visitor's address as nginx puts it in this header: the library's
      // own limit of opening links counts per address
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    telemetry: { enabled: false },
    // The library's own log goes through the same cleaning as the errors of
    // contacts and groups: no values of a failed query
    logger: { log: logAuthLibraryMessage },
    // An unexpected error under /api/auth goes to the caller instead of being
    // printed whole by the library: route-answer.ts logs it cleaned
    onAPIError: { throw: true },
    plugins: [
      magicLink({
        expiresIn: SIGN_IN_LINK_MINUTES * 60,
        async sendMagicLink({ email, url, token }) {
          // A new link cancels the earlier ones of this email. The record
          // of a link is "magic-link:<token>" with the email in its JSON
          // value (Better Auth 1.7); a test fails if this ever changes.
          await db
            .delete(verifications)
            .where(
              and(
                like(verifications.identifier, "magic-link:%"),
                ne(verifications.identifier, `magic-link:${token}`),
                sql`${verifications.value}::jsonb ->> 'email' = ${email}`,
              ),
            );
          await mailer.sendMail(buildSignInEmail({ to: email, url, from }));
        },
      }),
      ...plugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
