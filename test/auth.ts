// Helpers for tests of sign-in: a real Better Auth on the test database and
// a real Nodemailer that builds every email but sends it nowhere
// (jsonTransport), so a test can read what would have been sent.

import nodemailer, { type SendMailOptions } from "nodemailer";

import { createAuth } from "../src/lib/auth/create-auth";
import { requestSignInLink } from "../src/lib/auth/sign-in-request";

import type { TestDb } from "./db";

export const BASE_URL = "http://localhost:3000";
export const MAIL_FROM = '"Личная CRM" <noreply@mail.crm.linkbook.site>';
export const TEST_SECRET = "test-secret-test-secret-test-secret-0123456789";

export type SentMail = {
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  subject: string;
  html: string;
  text: string;
};

// The email transport the auth sends through, as a test reads it
export function createOutbox() {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const sent: SentMail[] = [];
  return {
    sent,
    mailer: {
      async sendMail(options: SendMailOptions) {
        const info = await transport.sendMail(options);
        sent.push(JSON.parse(info.message as string) as SentMail);
        return info;
      },
    },
  };
}

export function createTestAuth(
  db: TestDb,
  mailer?: Parameters<typeof createAuth>[0]["mailer"],
) {
  const outbox = createOutbox();
  const auth = createAuth({
    db,
    mailer: mailer ?? outbox.mailer,
    from: MAIL_FROM,
    baseURL: BASE_URL,
    secret: TEST_SECRET,
  });
  return { auth, sent: outbox.sent };
}

// The link in the button of an email
export function linkIn(mail: SentMail): string {
  const match = mail.text.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error("No link in the email");
  }
  return match[0];
}

// Opens a link the way a browser does: a GET request, no cookies yet
export async function openLink(
  auth: ReturnType<typeof createAuth>,
  link: string,
  cookie?: string,
): Promise<{ location: string | null; cookie: string | null }> {
  const response = await auth.handler(
    new Request(link, { headers: cookie ? { cookie } : {} }),
  );
  return {
    location: response.headers.get("location"),
    cookie: cookieOf(response),
  };
}

// "name=value" pairs of the Set-Cookie headers of a response, ready to be
// sent back as the Cookie header (what a browser does)
export function cookieOf(response: Response): string | null {
  const pairs = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .filter((pair) => !pair.endsWith("="));
  return pairs.length > 0 ? pairs.join("; ") : null;
}

// Signs a person in the way they do: asks for a link, opens it. Returns the
// cookie the browser would keep.
export async function signInAs(
  db: TestDb,
  auth: ReturnType<typeof createAuth>,
  sent: SentMail[],
  email: string,
): Promise<string> {
  await requestSignInLink(
    db,
    auth,
    email,
    new Headers({ "x-real-ip": "203.0.113.9" }),
  );
  const { cookie } = await openLink(auth, linkIn(sent[sent.length - 1]));
  if (!cookie) {
    throw new Error("The link did not sign anyone in");
  }
  return cookie;
}
