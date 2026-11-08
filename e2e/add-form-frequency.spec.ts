// "Как часто общаться" in the add form (openspec/changes/frequency-in-add-form,
// specs/keep-in-touch), done the way a person does it: in a browser, on the
// real app and database. One test per scenario, named after it.
// «База данных недоступна при добавлении контакта с частотой» is checked by
// a unit test (src/lib/contacts/commands.test.ts): the e2e database is
// shared and cannot be stopped in the middle of a run.

import type { Browser, Page } from "@playwright/test";

import { signIn, uniqueEmail } from "./auth";
import { databaseDate, replaceContacts } from "./db";
import { expect, newVisitor, test } from "./fixtures";

const DAY = 24 * 60 * 60 * 1000;
const dateHint = "Год подставится сам — ближайшая такая дата.";
const invalidDate = "Проверьте дату: день и месяц через точку, например 16.12";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

// The same field in the form and in the card
function frequencyField(page: Page) {
  return page.getByRole("combobox", { name: "Как часто общаться" });
}

function frequencyValue(page: Page) {
  return frequencyField(page).locator('[data-slot="select-value"]');
}

async function chooseFrequency(page: Page, option: string) {
  await frequencyField(page).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function dateField(page: Page) {
  return page.getByRole("textbox", { name: "День и месяц" });
}

function nameField(page: Page) {
  return page.getByRole("textbox", { name: "Имя" });
}

async function openAddForm(page: Page) {
  await page.goto("/contacts/new");
  await expect(
    page.getByRole("heading", { name: "Новый контакт", level: 1 }),
  ).toBeVisible();
}

// Presses «Добавить контакт» and waits for the server's answer: the same
// message can already be on the page from the previous press
async function submit(page: Page) {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await answered;
}

// After a successful «Добавить контакт» the list opens with the message;
// the number of the new contact is in the address
async function submitAndOpenCard(page: Page, name: string): Promise<number> {
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page.getByText(`Контакт «${name}» добавлен`)).toBeVisible();
  const id = Number(new URL(page.url()).searchParams.get("added"));
  await page.goto(`/contacts/${id}`);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return id;
}

function keepInTouchButton(page: Page) {
  return page.getByRole("link", { name: /^Пора связаться/ });
}

function dueRows(page: Page) {
  return page.getByRole("main").getByRole("listitem");
}

function contactRow(page: Page, name: string) {
  return page.getByRole("link", { name, exact: true });
}

// "2026-11-08" -> "8.11": typed the way a person types it
function typedDayMonth(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day}.${month}`;
}

async function inAnotherBrowser(
  browser: Browser,
  baseURL: string | undefined,
  email: string,
  body: (page: Page) => Promise<void>,
) {
  const context = await newVisitor(browser, baseURL);
  try {
    const page = await context.newPage();
    await signIn(page, email);
    await body(page);
  } finally {
    await context.close();
  }
}

async function topOf(page: Page, label: string, role?: "combobox") {
  const field = role
    ? page.getByRole(role, { name: label })
    : page.getByLabel(label, { exact: true });
  const box = await field.boundingBox();
  if (!box) {
    throw new Error(`The field «${label}» is not on the screen`);
  }
  return box.y;
}

test.describe("Частота в форме добавления контакта", () => {
  test("Поле частоты в форме добавления", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-field"));
    await page.getByRole("link", { name: "Добавить контакт" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Новый контакт", level: 1 }),
    ).toBeVisible();

    await expect(frequencyValue(page)).toHaveText("Не задано");
    // After «Телефон» and «Почта», before «Группы»
    const frequencyTop = await topOf(page, "Как часто общаться", "combobox");
    expect(frequencyTop).toBeGreaterThan(await topOf(page, "Телефон"));
    expect(frequencyTop).toBeGreaterThan(await topOf(page, "Почта"));
    expect(frequencyTop).toBeLessThan(await topOf(page, "Группы"));

    await frequencyField(page).click();
    await expect(page.getByRole("option")).toHaveText([
      "Не задано",
      "Раз в неделю",
      "Раз в месяц",
      "Раз в квартал",
      "Раз в год",
      "Другое…",
    ]);
  });

  test("Новый контакт без частоты", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-none"));
    await openAddForm(page);
    await nameField(page).fill("Вера");
    await submitAndOpenCard(page, "Вера");
    await expect(frequencyValue(page)).toHaveText("Не задано");
  });

  test("Новый контакт с частотой", async ({ page, browser, baseURL }) => {
    const email = uniqueEmail("aff-monthly");
    await signIn(page, email);
    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Раз в месяц");
    const id = await submitAndOpenCard(page, "Вера");

    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
    await page.reload();
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
    await inAnotherBrowser(browser, baseURL, email, async (other) => {
      await other.goto(`/contacts/${id}`);
      await expect(frequencyValue(other)).toHaveText("Раз в месяц");
    });
  });

  test("Отмена в форме добавления", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-cancel"));
    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Раз в неделю");
    await page.getByRole("link", { name: "Отмена" }).click();

    await expect(
      page.getByRole("heading", { name: "Контакты", level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(contactRow(page, "Вера")).toHaveCount(0);
  });

  test("В форме «Изменить» поля частоты нет", async ({ page }) => {
    const email = uniqueEmail("aff-edit");
    await signIn(page, email);
    const [id] = await replaceContacts(email, [
      { name: "Анна", contactFrequency: "quarterly" },
    ]);
    await page.goto(`/contacts/${id}/edit`);

    await expect(nameField(page)).toHaveValue("Анна");
    await expect(frequencyField(page)).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText(
      "Как часто общаться",
    );
  });
});

test.describe("Своя дата в форме добавления", () => {
  test("Поле своей даты в форме", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-date-field"));
    await openAddForm(page);
    await expect(dateField(page)).toBeHidden();

    await chooseFrequency(page, "Другое…");
    // No dialog, as in the card: the field is right in the form
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(frequencyValue(page)).toHaveText("Другое…");
    await expect(dateField(page)).toBeVisible();
    await expect(dateField(page)).toHaveValue("");
    await expect(dateField(page)).toHaveAttribute(
      "placeholder",
      "например, 16.12",
    );
    await expect(page.getByText(dateHint)).toBeVisible();
    await expect(dateField(page)).toBeFocused();
  });

  test("Новый контакт со своей датой", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-date"));
    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Другое…");
    await dateField(page).fill("16.12");
    await submitAndOpenCard(page, "Вера");

    await expect(frequencyValue(page)).toHaveText("Другое: 16.12");
    await page.reload();
    await expect(frequencyValue(page)).toHaveText("Другое: 16.12");
  });

  test("Передумать со своей датой", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-date-back"));
    await openAddForm(page);
    await chooseFrequency(page, "Другое…");
    await dateField(page).fill("16.12");

    await chooseFrequency(page, "Раз в год");
    await expect(dateField(page)).toBeHidden();
    await expect(page.getByText(dateHint)).toBeHidden();

    await nameField(page).fill("Вера");
    await submitAndOpenCard(page, "Вера");
    await expect(frequencyValue(page)).toHaveText("Раз в год");
  });
});

test.describe("Сроки у контакта с частотой из формы", () => {
  test("Обычная частота не делает контакт просроченным сразу", async ({
    page,
  }) => {
    const email = uniqueEmail("aff-due-weekly");
    await signIn(page, email);
    // Someone the person is already overdue with: the button shows 1
    await replaceContacts(email, [
      { name: "Анна", contactFrequency: "weekly", createdAt: daysAgo(30) },
    ]);
    await page.goto("/");
    await expect(keepInTouchButton(page)).toHaveText("Пора связаться · 1");

    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Раз в неделю");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await expect(page.getByText("Контакт «Вера» добавлен")).toBeVisible();

    await expect(keepInTouchButton(page)).toHaveText("Пора связаться · 1");
    await keepInTouchButton(page).click();
    await expect(dueRows(page)).toHaveText([/Анна/]);
  });

  test("Сегодняшняя своя дата при добавлении", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-due-today"));
    const today = await databaseDate();

    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Другое…");
    await dateField(page).fill(typedDayMonth(today));
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await expect(page.getByText("Контакт «Вера» добавлен")).toBeVisible();

    await expect(keepInTouchButton(page)).toHaveText("Пора связаться · 1");
    await keepInTouchButton(page).click();
    await expect(dueRows(page)).toHaveText([/Вера/]);
  });
});

test.describe("Неверная своя дата в форме добавления", () => {
  test("Такой даты не бывает в форме", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-bad-date"));
    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Другое…");
    await dateField(page).fill("31.02");
    await submit(page);

    await expect(page.getByText(invalidDate)).toBeVisible();
    await expect(dateField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL((url) => url.pathname === "/contacts/new");
    await expect(nameField(page)).toHaveValue("Вера");
    await expect(frequencyValue(page)).toHaveText("Другое…");
    await expect(dateField(page)).toHaveValue("31.02");

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Контакты", level: 1 }),
    ).toBeVisible();
    await expect(contactRow(page, "Вера")).toHaveCount(0);
  });

  test("Не дата в форме", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-not-date"));
    await openAddForm(page);
    await nameField(page).fill("Вера");
    await chooseFrequency(page, "Другое…");

    for (const typed of ["завтра", "16,12", ""]) {
      await dateField(page).fill(typed);
      await submit(page);
      await expect(page.getByText(invalidDate)).toBeVisible();
      await expect(dateField(page)).toHaveValue(typed);
    }

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Контакты", level: 1 }),
    ).toBeVisible();
    await expect(contactRow(page, "Вера")).toHaveCount(0);
  });

  test("Неверная дата и пустое имя", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-two-errors"));
    await openAddForm(page);
    await nameField(page).fill("   ");
    await chooseFrequency(page, "Другое…");
    await dateField(page).fill("31.02");
    await submit(page);

    await expect(page.getByText("Укажите имя")).toBeVisible();
    await expect(page.getByText(invalidDate)).toBeVisible();
  });
});

test.describe("Ошибка в форме добавления не сбрасывает частоту", () => {
  test("Ошибка в имени не сбрасывает частоту", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-keep-frequency"));
    await openAddForm(page);
    await nameField(page).fill("   ");
    await chooseFrequency(page, "Раз в квартал");
    await submit(page);

    await expect(page.getByText("Укажите имя")).toBeVisible();
    await expect(frequencyValue(page)).toHaveText("Раз в квартал");

    // And it is really sent with the next press, not only shown
    await nameField(page).fill("Вера");
    await submitAndOpenCard(page, "Вера");
    await expect(frequencyValue(page)).toHaveText("Раз в квартал");
  });

  test("Ошибка в имени не сбрасывает свою дату", async ({ page }) => {
    await signIn(page, uniqueEmail("aff-keep-date"));
    await openAddForm(page);
    await nameField(page).fill("   ");
    await chooseFrequency(page, "Другое…");
    await dateField(page).fill("16.12");
    await submit(page);

    await expect(page.getByText("Укажите имя")).toBeVisible();
    await expect(frequencyValue(page)).toHaveText("Другое…");
    await expect(dateField(page)).toHaveValue("16.12");

    await nameField(page).fill("Вера");
    await submitAndOpenCard(page, "Вера");
    await expect(frequencyValue(page)).toHaveText("Другое: 16.12");
  });
});
