// Everyone has their own contacts, notes and groups
// (openspec/specs/data-ownership): every scenario done the way
// a person does it, in a browser, with two people at once in two browsers.
// The test names are the names of the scenarios in the spec.

import type { Page } from "@playwright/test";

import { signIn, uniqueEmail } from "./auth";
import { replaceContacts } from "./db";
import { expect, newVisitor, test } from "./fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;

const contactsHeading = (page: Page) =>
  page.getByRole("heading", { name: "Контакты", level: 1 });

const notFound = (page: Page) =>
  page.getByRole("heading", { name: "Контакт не найден" });

const contactRow = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true });

// Adds a contact through the form of the app and gives its number: the
// number is in the address the app opens afterwards
async function addContactByForm(page: Page, name: string): Promise<number> {
  await page.goto("/contacts/new");
  await page.getByRole("textbox", { name: "Имя" }).fill(name);
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page.getByText(`Контакт «${name}» добавлен`)).toBeVisible();
  const added = new URL(page.url()).searchParams.get("added");
  return Number(added);
}

test("Контакт A не виден B", async ({ browser, baseURL }) => {
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, uniqueEmail("a"));
    await signIn(pageB, uniqueEmail("b"));

    // A adds a contact: B does not see him — not in the list, not in the
    // search, not by a direct link
    const glebId = await addContactByForm(pageA, "Глеб Соколов");
    await pageB.goto("/");
    await expect(contactsHeading(pageB)).toBeVisible();
    await expect(contactRow(pageB, "Глеб Соколов")).toBeHidden();
    await expect(pageB.getByText("Пока нет ни одного контакта")).toBeVisible();
    await pageB.goto(`/contacts/${glebId}`);
    await expect(notFound(pageB)).toBeVisible();
    await expect(pageB.getByText("Глеб Соколов")).toBeHidden();

    // And the other way round: B adds his own, A does not see it
    await pageB.goto("/");
    const borisId = await addContactByForm(pageB, "Борис Орлов");
    await pageA.goto("/");
    await expect(contactsHeading(pageA)).toBeVisible();
    await expect(contactRow(pageA, "Борис Орлов")).toBeHidden();
    await pageA
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .fill("орлов");
    await expect(pageA.getByText(/Никого не нашли по запросу/)).toBeVisible();
    await expect(contactRow(pageA, "Борис Орлов")).toBeHidden();
    await pageA.goto(`/contacts/${borisId}`);
    await expect(notFound(pageA)).toBeVisible();

    // In the end everyone has exactly one contact, their own
    await pageA.goto("/");
    await expect(pageA.getByText(/^1 контакт/)).toBeVisible();
    await expect(contactRow(pageA, "Глеб Соколов")).toBeVisible();
    await pageB.goto("/");
    await expect(pageB.getByText(/^1 контакт/)).toBeVisible();
    await expect(contactRow(pageB, "Борис Орлов")).toBeVisible();

    // The search by name in B's list does not find A's contact either
    await pageB
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .fill("соколов");
    await expect(pageB.getByText(/Никого не нашли по запросу/)).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

test("Группы другого пользователя не видны", async ({ browser, baseURL }) => {
  const emailA = uniqueEmail("a");
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, emailA);
    await signIn(pageB, uniqueEmail("b"));
    await replaceContacts(emailA, [{ name: "Анна", groups: ["Йога"] }]);

    await pageB.goto("/groups");
    await expect(pageB.getByText("Групп пока нет")).toBeVisible();
    await expect(pageB.getByText("Йога")).toBeHidden();

    await pageB.goto("/");
    await expect(
      pageB.getByRole("navigation", { name: "Группы" }),
    ).toBeHidden();
    await expect(pageB.getByRole("button", { name: "Йога" })).toBeHidden();

    // In the card of B's own contact the field «Группы» offers nothing of A
    const id = await addContactByForm(pageB, "Борис");
    await pageB.goto(`/contacts/${id}`);
    await pageB.getByRole("combobox", { name: "Группы" }).click();
    await expect(pageB.getByRole("option", { name: "Йога" })).toBeHidden();

    // A, of course, sees his group
    await pageA.goto("/groups");
    await expect(pageA.getByText("Йога", { exact: true })).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

test('"Пора связаться" считает только своих', async ({ browser, baseURL }) => {
  const emailA = uniqueEmail("a");
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, emailA);
    await signIn(pageB, uniqueEmail("b"));
    // Two of A's people are overdue
    await replaceContacts(emailA, [
      {
        name: "Анна Смирнова",
        contactFrequency: "weekly",
        createdAt: new Date(Date.now() - 60 * DAY_MS),
      },
      {
        name: "Борис Петров",
        contactFrequency: "weekly",
        createdAt: new Date(Date.now() - 60 * DAY_MS),
      },
    ]);

    await pageA.goto("/");
    await expect(
      pageA.getByRole("link", { name: /^Пора связаться/ }),
    ).toHaveText("Пора связаться · 2");

    await pageB.goto("/");
    await expect(
      pageB.getByRole("link", { name: /^Пора связаться/ }),
    ).toHaveText("Пора связаться");
    await pageB.goto("/keep-in-touch");
    await expect(pageB.getByText("Частота пока не задана")).toBeVisible();
    await expect(pageB.getByText("Анна Смирнова")).toBeHidden();
    await expect(pageB.getByText("Борис Петров")).toBeHidden();
  } finally {
    await a.close();
    await b.close();
  }
});

test("Номер чужой группы в адресе", async ({ browser, baseURL }) => {
  const emailA = uniqueEmail("a");
  const emailB = uniqueEmail("b");
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, emailA);
    await signIn(pageB, emailB);
    await replaceContacts(emailA, [{ name: "Анна", groups: ["Йога"] }]);
    await replaceContacts(emailB, [{ name: "Борис", groups: ["Работа"] }]);

    // The number of A's group, as the link on A's page shows it
    await pageA.goto("/groups");
    const href = await pageA
      .getByRole("link", { name: "Йога", exact: true })
      .getAttribute("href");

    await pageB.goto(href!);

    await expect(
      pageB.getByRole("button", { name: "Все", pressed: true }),
    ).toBeVisible();
    // The rows of people in groups also name their groups, so by the name
    // only: the first words of the row
    await expect(pageB.getByRole("link", { name: /^Борис/ })).toBeVisible();
    await expect(pageB.getByRole("link", { name: /^Анна/ })).toBeHidden();
  } finally {
    await a.close();
    await b.close();
  }
});

test("Прямая ссылка на чужой контакт", async ({ browser, baseURL }) => {
  const emailA = uniqueEmail("a");
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, emailA);
    await signIn(pageB, uniqueEmail("b"));
    const [id] = await replaceContacts(emailA, [{ name: "Глеб Соколов" }]);

    // The card and the «Изменить» page: the same as for a contact that does
    // not exist, and the name is nowhere
    for (const address of [`/contacts/${id}`, `/contacts/${id}/edit`]) {
      await pageB.goto(address);
      await expect(notFound(pageB)).toBeVisible();
      await expect(
        pageB.getByRole("link", { name: "К списку контактов" }),
      ).toBeVisible();
      await expect(pageB.getByText("Глеб Соколов")).toBeHidden();
      await expect(pageB).not.toHaveTitle(/Соколов/);
    }
  } finally {
    await a.close();
    await b.close();
  }
});

test("Сообщение об удалении чужого контакта", async ({ browser, baseURL }) => {
  const emailA = uniqueEmail("a");
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, emailA);
    await signIn(pageB, uniqueEmail("b"));
    const [id] = await replaceContacts(emailA, [{ name: "Глеб Соколов" }]);

    // A deletes: the message with «Отменить» is on A's screen
    await pageA.goto(`/contacts/${id}`);
    await pageA.getByRole("button", { name: "Удалить" }).click();
    await pageA
      .getByRole("alertdialog")
      .getByRole("button", { name: "Удалить" })
      .click();
    await expect(pageA.getByRole("button", { name: "Отменить" })).toBeVisible();

    // B opens the same address within the five seconds
    await pageB.goto(`/?deleted=${id}`);
    await expect(contactsHeading(pageB)).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Отменить" })).toBeHidden();
    await expect(pageB.getByText("Глеб Соколов")).toBeHidden();
  } finally {
    await a.close();
    await b.close();
  }
});

test("Старая вкладка после смены пользователя", async ({
  browser,
  baseURL,
}) => {
  const emailA = uniqueEmail("a");
  const emailB = uniqueEmail("b");
  const context = await newVisitor(browser, baseURL);
  try {
    const first = await context.newPage();
    await signIn(first, emailA);
    const [id] = await replaceContacts(emailA, [{ name: "Глеб Соколов" }]);
    await first.goto(`/contacts/${id}`);
    await expect(
      first.getByRole("heading", { name: "Глеб Соколов", level: 1 }),
    ).toBeVisible();

    // In another tab of the same browser A signs out and B signs in
    const second = await context.newPage();
    await second.goto("/");
    await second.getByRole("button", { name: "Выйти" }).click();
    await second.getByRole("button", { name: "Да, выйти" }).click();
    await expect(
      second.getByRole("heading", { name: "Вход", level: 1 }),
    ).toBeVisible();
    await signIn(second, emailB);

    // The first tab is not refreshed. A note: refused.
    await first
      .getByRole("textbox", { name: "Новая заметка" })
      .fill("Чужая заметка");
    await first.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(first.getByText("Контакт не найден")).toBeVisible();

    // The frequency: refused, not saved
    await first.getByRole("combobox", { name: "Как часто общаться" }).click();
    await first
      .getByRole("option", { name: "Раз в неделю", exact: true })
      .click();
    await expect(first.getByText(/Контакт не найден/).first()).toBeVisible();

    // Delete: the list of B opens, without Глеб Соколов
    await first.getByRole("button", { name: "Удалить" }).click();
    await first
      .getByRole("alertdialog")
      .getByRole("button", { name: "Удалить" })
      .click();
    await expect(contactsHeading(first)).toBeVisible();
    await expect(contactRow(first, "Глеб Соколов")).toBeHidden();
    await expect(first.getByText("Пока нет ни одного контакта")).toBeVisible();

    // When A comes back: no new note, the same frequency, not deleted
    await first.getByRole("button", { name: "Выйти" }).click();
    await first.getByRole("button", { name: "Да, выйти" }).click();
    // Signed out for real before signing in: otherwise the next page can
    // cut off the sign-out request, and B stays signed in
    await expect(
      first.getByRole("heading", { name: "Вход", level: 1 }),
    ).toBeVisible();
    await signIn(first, emailA);
    await expect(contactRow(first, "Глеб Соколов")).toBeVisible();
    await first.goto(`/contacts/${id}`);
    await expect(first.getByText("Чужая заметка")).toBeHidden();
    await expect(first.getByText("Пока нет заметок")).toBeVisible();
    await expect(
      first.getByRole("combobox", { name: "Как часто общаться" }),
    ).toContainText("Не задано");
  } finally {
    await context.close();
  }
});

test("Первый вход нового пользователя", async ({ page }) => {
  await signIn(page, uniqueEmail("boris"));

  await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Добавить контакт" }).first(),
  ).toBeVisible();

  await page.goto("/groups");
  await expect(page.getByText("Групп пока нет")).toBeVisible();

  await page.goto("/keep-in-touch");
  await expect(page.getByText("Частота пока не задана")).toBeVisible();
});

test("У нового пользователя групп нет", async ({ page }) => {
  await signIn(page, uniqueEmail("boris"));

  await page.goto("/groups");
  await expect(page.getByText("Групп пока нет")).toBeVisible();

  // On the home page: no buttons of groups, no «Все», only the way to make some
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Все" })).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Настроить группы" }),
  ).toBeVisible();
});

test("Такая же группа у другого пользователя", async ({ browser, baseURL }) => {
  const emailA = uniqueEmail("a");
  const a = await newVisitor(browser, baseURL);
  const b = await newVisitor(browser, baseURL);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, emailA);
    await signIn(pageB, uniqueEmail("b"));
    await replaceContacts(emailA, [{ name: "Анна", groups: ["Друзья"] }]);

    // B makes the group with the same name
    await pageB.goto("/groups");
    await pageB.getByRole("textbox", { name: "Новая группа" }).fill("Друзья");
    await pageB.getByRole("button", { name: "Создать" }).click();
    const rowB = pageB.getByRole("listitem").filter({ hasText: "Друзья" });
    await expect(rowB).toContainText("0 контактов");

    // A's group and its people are as they were
    await pageA.goto("/groups");
    const rowA = pageA.getByRole("listitem").filter({ hasText: "Друзья" });
    await expect(rowA).toContainText("1 контакт");
  } finally {
    await a.close();
    await b.close();
  }
});
