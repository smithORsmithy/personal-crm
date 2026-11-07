// The main scenario from specs/01-продуктовая-идея.md, done the way a person
// does it: in a browser, on the real app and a real database.
// - open: the list shows every contact
// - add a contact, find it by name, add a note: the note is saved in the card
// - the same address in another browser: the same contacts

import { expect, test, type Page } from "@playwright/test";

import { replaceContacts } from "./db";

const existing = [
  { name: "Анна Смирнова", about: "Дизайнер в студии" },
  { name: "Борис Петров", about: "Сосед по даче" },
  { name: "Вера Иванова", about: "Тренер по теннису" },
];

const added = {
  name: "Глеб Соколов",
  about: "Аналитик, бывший коллега",
  howWeMet: "Работали вместе в банке",
  phone: "+7 900 123-45-67",
  email: "gleb@example.com",
};

const allNames = [...existing.map((contact) => contact.name), added.name];

const note =
  "Созвонились: договорились встретиться в пятницу и обсудить его проект";

test.beforeEach(async () => {
  await replaceContacts(existing);
});

test("main scenario: list, add a contact, find it, add a note, another browser", async ({
  page,
  browser,
  baseURL,
}) => {
  await test.step("open: the list shows every contact", async () => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Контакты", level: 1 }),
    ).toBeVisible();
    await expectContactList(
      page,
      existing.map((contact) => contact.name),
    );
  });

  await test.step("add a contact: it appears in the list", async () => {
    await page.getByRole("link", { name: "Добавить контакт" }).click();
    await page.getByRole("textbox", { name: "Имя" }).fill(added.name);
    await page.getByRole("textbox", { name: "Кто это" }).fill(added.about);
    await page
      .getByRole("textbox", { name: "Откуда знакомы" })
      .fill(added.howWeMet);
    await page.getByRole("textbox", { name: "Телефон" }).fill(added.phone);
    await page.getByRole("textbox", { name: "Почта" }).fill(added.email);
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(
      page.getByText(`Контакт «${added.name}» добавлен`),
    ).toBeVisible();
    await expectContactList(page, allNames);
  });

  await test.step("find the contact by name and open the card", async () => {
    await page
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .fill("соколов");
    await expect(page.getByText("Найдено: 1 из 4")).toBeVisible();
    await expect(contactLink(page, existing[0].name)).toBeHidden();

    await contactLink(page, added.name).click();
    await expect(
      page.getByRole("heading", { name: added.name, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: added.phone })).toBeVisible();
    await expect(page.getByRole("link", { name: added.email })).toBeVisible();
  });

  await test.step("add a note: it is saved in the card", async () => {
    await page.getByRole("textbox", { name: "Новая заметка" }).fill(note);
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();
    await expect(notes(page).getByText(note)).toBeVisible();

    // After a reload the card comes from the server again
    await page.reload();
    await expect(notes(page).getByText(note)).toBeVisible();
  });

  await test.step("another browser: the same contacts and the note", async () => {
    // A separate browser profile: nothing shared with the first one
    const otherBrowser = await browser.newContext({ baseURL });
    try {
      const other = await otherBrowser.newPage();
      await other.goto("/");
      await expectContactList(other, allNames);

      await contactLink(other, added.name).click();
      await expect(notes(other).getByText(note)).toBeVisible();
    } finally {
      await otherBrowser.close();
    }
  });
});

// The list shows exactly these people: the count above it matches, and
// each of them is in it
async function expectContactList(page: Page, names: string[]) {
  await expect(
    page.getByText(new RegExp(`^${names.length} контакт`)),
  ).toBeVisible();
  for (const name of names) {
    await expect(contactLink(page, name)).toBeVisible();
  }
}

// A row of the list: the link to the person's card
function contactLink(page: Page, name: string) {
  return page.getByRole("link", { name });
}

// The "Заметки" block of the card
function notes(page: Page) {
  return page.getByRole("region", { name: "Заметки" });
}
