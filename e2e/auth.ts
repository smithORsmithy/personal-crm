// Signing in for e2e, the way a person does it: the form, the email in
// Mailpit, the link from it.

import { randomBytes } from "node:crypto";

import type { Page } from "@playwright/test";

import { expect } from "./fixtures";
import { countEmailsTo, waitForEmail, type Email } from "./mailpit";

// An address of its own for every test: the limit of 3 emails per 10
// minutes and the emails of other tests cannot get in the way
export function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(4).toString("hex")}@example.test`;
}

// Fills the sign-in form and presses «Получить ссылку». The email that
// arrives is returned; the page is left on the sign-in form.
export async function requestLink(
  page: Page,
  typed: string,
  shownAs: string = typed.trim().toLowerCase(),
): Promise<Email> {
  const already = await countEmailsTo(shownAs);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Почта" }).fill(typed);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(
    page.getByText(`Ссылка для входа отправлена на ${shownAs}`),
  ).toBeVisible();
  return waitForEmail(shownAs, already);
}

// Signs in: asks for a link and opens it. At the end the page shows the list.
export async function signIn(page: Page, email: string): Promise<void> {
  const mail = await requestLink(page, email);
  await page.goto(mail.link);
  await expect(
    page.getByRole("heading", { name: "Контакты", level: 1 }),
  ).toBeVisible();
}
