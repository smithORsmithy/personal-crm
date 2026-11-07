// Sign in by a link from an email (openspec/specs/sign-in):
// every scenario done the way a person does it, in a browser, on the real
// app and a real database. The emails are read from Mailpit, the fake mailbox.
// Time is moved in the database (e2e/db.ts): nobody waits 16 minutes.
// The test names are the names of the scenarios in the spec.

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { requestLink, signIn, uniqueEmail } from "./auth";
import {
  expireSignInLinks,
  replaceContacts,
  setSignInDaysLeft,
  signInDaysLeft,
  userExists,
} from "./db";
import { expect, newVisitor, test } from "./fixtures";
import { countEmailsTo, waitForEmail } from "./mailpit";

const DAY_MS = 24 * 60 * 60 * 1000;

const header = (page: Page) => page.getByRole("banner");

// The page of the list: the heading above the contacts
const contactsHeading = (page: Page) =>
  page.getByRole("heading", { name: "Контакты", level: 1 });

const signInHeading = (page: Page) =>
  page.getByRole("heading", { name: "Вход", level: 1 });

const expiredText = (page: Page) =>
  page.getByText("Ссылка устарела, запросите новую");

// Another person or another device: a browser of its own
async function visitor(
  browser: Browser,
  baseURL: string | undefined,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await newVisitor(browser, baseURL);
  return { context, page: await context.newPage() };
}

// «Выйти» and the answer «Да, выйти» in the window that asks
async function signOut(page: Page) {
  await header(page).getByRole("button", { name: "Выйти" }).click();
  await page.getByRole("button", { name: "Да, выйти" }).click();
  await expect(signInHeading(page)).toBeVisible();
}

test.describe("Без входа — только страница входа", () => {
  test("Открыть приложение без входа", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(signInHeading(page)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Почта" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Получить ссылку" }),
    ).toBeVisible();
    await expect(contactsHeading(page)).toBeHidden();
  });

  test("Прямая ссылка без входа", async ({ page }) => {
    for (const address of ["/contacts/1", "/groups", "/keep-in-touch"]) {
      await page.goto(address);
      await expect(signInHeading(page)).toBeVisible();
    }
  });

  test("Вошедший открывает страницу входа", async ({ page }) => {
    await signIn(page, uniqueEmail("anna"));

    await page.goto("/login");

    await expect(contactsHeading(page)).toBeVisible();
    await expect(signInHeading(page)).toBeHidden();
  });
});

test.describe("Запрос ссылки для входа", () => {
  test("Получить ссылку", async ({ page }) => {
    const email = uniqueEmail("anna");

    const mail = await requestLink(page, email);

    await expect(
      page.getByText(`Ссылка для входа отправлена на ${email}`),
    ).toBeVisible();
    expect(mail.subject).toBe("Вход в Личную CRM");
    expect(mail.to).toEqual([email]);
  });

  test("Новая и знакомая почта — одинаково", async ({
    page,
    browser,
    baseURL,
  }) => {
    const known = uniqueEmail("anna");
    const fresh = uniqueEmail("boris");
    await signIn(page, known);

    const { context, page: other } = await visitor(browser, baseURL);
    try {
      await requestLink(other, known);
      await expect(
        other.getByText(`Ссылка для входа отправлена на ${known}`),
      ).toBeVisible();
      const knownMessage = await other.getByRole("status").textContent();

      await requestLink(other, fresh);
      const freshMessage = await other.getByRole("status").textContent();

      // The same words, only the email differs
      expect(freshMessage?.replace(fresh, "<почта>")).toBe(
        knownMessage?.replace(known, "<почта>"),
      );
      expect(await countEmailsTo(known)).toBeGreaterThanOrEqual(2);
      expect(await countEmailsTo(fresh)).toBe(1);
    } finally {
      await context.close();
    }
  });

  test("Почта с пробелами и большими буквами", async ({ page }) => {
    const email = uniqueEmail("anna");

    const mail = await requestLink(
      page,
      `  ${email.replace("anna", "Anna").replace("example.test", "Example.TEST")}  `,
      email,
    );

    await expect(
      page.getByText(`Ссылка для входа отправлена на ${email}`),
    ).toBeVisible();
    expect(mail.to).toEqual([email]);
  });

  test("Тот же пользователь при другом написании почты", async ({ page }) => {
    const email = uniqueEmail("anna");
    const mail = await requestLink(page, email.replace("anna", "Anna"), email);
    await page.goto(mail.link);
    await expect(contactsHeading(page)).toBeVisible();
    await replaceContacts(email, [{ name: "Глеб Соколов" }]);

    await signOut(page);
    await signIn(page, email);

    await expect(
      page.getByRole("link", { name: "Глеб Соколов" }),
    ).toBeVisible();
  });

  test("Неверная почта в форме", async ({ page }) => {
    await page.goto("/login");
    const field = page.getByRole("textbox", { name: "Почта" });

    await field.fill("anna@");
    await page.getByRole("button", { name: "Получить ссылку" }).click();
    await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
    await expect(field).toHaveValue("anna@");
    await expect(page.getByText(/Ссылка для входа отправлена/)).toBeHidden();

    await field.fill("");
    await page.getByRole("button", { name: "Получить ссылку" }).click();
    await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
    await expect(page.getByText(/Ссылка для входа отправлена/)).toBeHidden();
  });

  test("Запрос не из формы", async ({ page, request }) => {
    const email = uniqueEmail("anna");
    const body = { "content-type": "application/json" };

    const wrong = await request.post("/api/auth/sign-in/magic-link", {
      headers: body,
      data: { email: "anna@" },
    });
    // Even a right address does not work this way: the only way is the form
    const right = await request.post("/api/auth/sign-in/magic-link", {
      headers: body,
      data: { email },
    });

    expect(wrong.status()).toBe(404);
    expect(right.status()).toBe(404);
    await page.waitForTimeout(500);
    expect(await countEmailsTo(email)).toBe(0);
  });
});

test.describe("Вход по ссылке из письма", () => {
  test("Войти по ссылке", async ({ page }) => {
    const email = uniqueEmail("anna");

    await signIn(page, email);

    await expect(contactsHeading(page)).toBeVisible();
    await expect(header(page).getByText(email)).toBeVisible();
  });

  test("Первый вход новой почты", async ({ page }) => {
    const email = uniqueEmail("boris");
    expect(await userExists(email)).toBe(false);

    const mail = await requestLink(page, email);
    await page.goto(mail.link);

    // Straight to the list: no form to sign up, no question about the name
    await expect(contactsHeading(page)).toBeVisible();
    await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
    await expect(header(page).getByText(email)).toBeVisible();
    expect(await userExists(email)).toBe(true);
  });

  test("Ссылку открыли второй раз", async ({ page, browser, baseURL }) => {
    const mail = await requestLink(page, uniqueEmail("anna"));
    await page.goto(mail.link);
    await expect(contactsHeading(page)).toBeVisible();

    const { context, page: other } = await visitor(browser, baseURL);
    try {
      await other.goto(mail.link);

      await expect(expiredText(other)).toBeVisible();
      await other.goto("/");
      await expect(signInHeading(other)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("Прошло больше 15 минут", async ({ page }) => {
    const email = uniqueEmail("anna");
    const mail = await requestLink(page, email);

    // 16 minutes later: the link has ended
    await expireSignInLinks(email);
    await page.goto(mail.link);

    await expect(expiredText(page)).toBeVisible();
    await page.goto("/");
    await expect(signInHeading(page)).toBeVisible();
  });

  test("Кнопка на страницу входа", async ({ page }) => {
    const email = uniqueEmail("anna");
    const mail = await requestLink(page, email);
    await expireSignInLinks(email);
    await page.goto(mail.link);
    await expect(expiredText(page)).toBeVisible();

    await page.getByRole("link", { name: "На страницу входа" }).click();

    await expect(signInHeading(page)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Почта" })).toBeVisible();
  });
});

test.describe("Новая ссылка отменяет прежние", () => {
  test("Запросила ссылку дважды", async ({ page }) => {
    const email = uniqueEmail("anna");
    const first = await requestLink(page, email);
    const second = await requestLink(page, email);

    await page.goto(first.link);
    await expect(expiredText(page)).toBeVisible();

    await page.goto(second.link);
    await expect(contactsHeading(page)).toBeVisible();
  });
});

test.describe("Не больше 3 писем на одну почту за 10 минут", () => {
  const tooOften = "Слишком часто, попробуйте через несколько минут";

  test("Четвёртый запрос за 10 минут", async ({ page }) => {
    const email = uniqueEmail("anna");
    for (let i = 0; i < 3; i++) {
      await requestLink(page, email);
    }

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Почта" }).fill(email);
    await page.getByRole("button", { name: "Получить ссылку" }).click();

    await expect(page.getByText(tooOften)).toBeVisible();
    await expect(page.getByText(/Ссылка для входа отправлена/)).toBeHidden();
    await page.waitForTimeout(500);
    expect(await countEmailsTo(email)).toBe(3);
  });

  test("Другая почта не затронута", async ({ page }) => {
    const limited = uniqueEmail("anna");
    const other = uniqueEmail("boris");
    for (let i = 0; i < 3; i++) {
      await requestLink(page, limited);
    }
    await page.getByRole("button", { name: "Получить ссылку" }).click();
    await expect(page.getByText(tooOften)).toBeVisible();

    await requestLink(page, other);

    await expect(
      page.getByText(`Ссылка для входа отправлена на ${other}`),
    ).toBeVisible();
  });
});

test.describe("Вход держится 30 дней с последнего захода", () => {
  test("Закрыла браузер и вернулась", async ({ page, browser, baseURL }) => {
    await signIn(page, uniqueEmail("anna"));
    // What a browser keeps on disk when it is closed
    const kept = await page.context().storageState();

    const context = await browser.newContext({ baseURL, storageState: kept });
    try {
      const back = await context.newPage();
      await back.goto("/");
      await expect(contactsHeading(back)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("Не заходила больше 30 дней", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);

    // 31 days without a visit: the sign-in has ended
    await setSignInDaysLeft(email, -1);
    await page.goto("/");

    await expect(signInHeading(page)).toBeVisible();
  });

  test("Заход продлевает срок", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const context = page.context();

    // The last visit was 2 days ago: 28 days are left, in the database and
    // in the browser's cookie
    await setSignInDaysLeft(email, 28);
    const [cookie] = (await context.cookies()).filter((item) =>
      item.name.includes("session_token"),
    );
    await context.clearCookies({ name: cookie.name });
    await context.addCookies([
      { ...cookie, expires: Math.floor((Date.now() + 28 * DAY_MS) / 1000) },
    ]);

    await page.goto("/");
    await expect(contactsHeading(page)).toBeVisible();

    // The visit moved the end of the sign-in 30 days ahead, both places
    expect(await signInDaysLeft(email)).toEqual([30]);
    const [renewed] = (await context.cookies()).filter((item) =>
      item.name.includes("session_token"),
    );
    const daysLeft = (renewed.expires * 1000 - Date.now()) / DAY_MS;
    expect(daysLeft).toBeGreaterThan(29.5);
    expect(daysLeft).toBeLessThan(30.5);
  });
});

test.describe("Несколько устройств сразу", () => {
  test("Два браузера", async ({ page, browser, baseURL }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    await replaceContacts(email, [{ name: "Глеб Соколов" }]);

    const { context, page: second } = await visitor(browser, baseURL);
    try {
      await signIn(second, email);

      await page.reload();
      await expect(contactsHeading(page)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Глеб Соколов" }),
      ).toBeVisible();
      await expect(
        second.getByRole("link", { name: "Глеб Соколов" }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("Почта в шапке и выход", () => {
  test("Почта и кнопка в шапке", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);

    for (const address of ["/", "/groups", "/keep-in-touch", "/contacts/new"]) {
      await page.goto(address);
      await expect(header(page).getByText(email)).toBeVisible();
      await expect(
        header(page).getByRole("button", { name: "Выйти" }),
      ).toBeVisible();
    }
  });

  test("Выйти", async ({ page }) => {
    await signIn(page, uniqueEmail("anna"));

    await header(page).getByRole("button", { name: "Выйти" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Вы уверены?")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Да, выйти" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Нет, вернуться" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Да, выйти" }).click();

    await expect(signInHeading(page)).toBeVisible();
    await page.goto("/");
    await expect(signInHeading(page)).toBeVisible();
  });

  test("Передумать выходить", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const [id] = await replaceContacts(email, [{ name: "Глеб Соколов" }]);
    await page.goto(`/contacts/${id}`);
    const card = page.getByRole("heading", { name: "Глеб Соколов", level: 1 });
    await expect(card).toBeVisible();

    await header(page).getByRole("button", { name: "Выйти" }).click();
    await page.getByRole("button", { name: "Нет, вернуться" }).click();

    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(card).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
    await page.reload();
    await expect(card).toBeVisible();
  });

  test("Выход только на этом устройстве", async ({
    page,
    browser,
    baseURL,
  }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);

    const { context, page: second } = await visitor(browser, baseURL);
    try {
      await signIn(second, email);

      await signOut(page);
      await second.reload();

      await expect(contactsHeading(second)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("Письмо для входа", () => {
  test("Что в письме", async ({ page }) => {
    const email = uniqueEmail("anna");

    const mail = await requestLink(page, email);

    expect(mail.from).toEqual({
      name: "Личная CRM",
      address: "noreply@mail.crm.linkbook.site",
    });
    expect(mail.subject).toBe("Вход в Личную CRM");
    expect(mail.html).toContain("Войти");
    expect(mail.html).toContain("15 минут");
    expect(mail.text).toContain(
      "Если вы не запрашивали вход — просто проигнорируйте письмо",
    );
  });
});

test.describe("Куда уходят письма", () => {
  test("На компьютере письма в заглушке", async ({ page }) => {
    const email = uniqueEmail("test-a");

    await requestLink(page, email);

    // In Mailpit, not in a real mailbox; the link from it lets in
    const mail = await waitForEmail(email);
    await page.goto(mail.link);
    await expect(contactsHeading(page)).toBeVisible();
    await expect(header(page).getByText(email)).toBeVisible();
  });
});
