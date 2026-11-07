// "Пора связаться" (openspec/specs/keep-in-touch), the main paths done the
// way a person does them: in a browser, on the real app and database.
// The rule itself (terms, dates, order) is checked by unit tests in
// src/lib/contacts/due.test.ts; here — that the screens show it.

import type { Browser, Page } from "@playwright/test";

import { formatDate } from "../src/lib/format";

import { signIn, uniqueEmail } from "./auth";
import { databaseDate, replaceContacts } from "./db";
import { expect, newVisitor, test } from "./fixtures";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

test("frequency: choose it, the person shows up, a note takes them off", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = "Глеб Соколов";
  const email = uniqueEmail("kit-frequency");
  await signIn(page, email);
  // Added two months ago, no notes, nothing under "Кто это"
  const [id] = await replaceContacts(email, [{ name, createdAt: daysAgo(60) }]);

  await test.step("nobody has a frequency yet", async () => {
    await page.goto("/keep-in-touch");
    await expect(page.getByText("Частота пока не задана")).toBeVisible();
    await expect(
      page.getByText(
        "Откройте карточку контакта и выберите, как часто хотите общаться.",
      ),
    ).toBeVisible();
  });

  await test.step("choose «Раз в месяц» in the card: it is saved", async () => {
    await page.goto(`/contacts/${id}`);
    await expect(frequencyValue(page)).toHaveText("Не задано");
    await untilSaved(page, () => choose(page, "Раз в месяц"));
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");

    await page.reload();
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
    await inAnotherBrowser(browser, baseURL, email, async (other) => {
      await other.goto(`/contacts/${id}`);
      await expect(frequencyValue(other)).toHaveText("Раз в месяц");
    });
  });

  await test.step("home: the button counts the person, the list has no marks", async () => {
    await page.goto("/");
    await expect(keepInTouchButton(page)).toHaveText("Пора связаться · 1");
    await expect(page.getByRole("link", { name })).not.toContainText(
      /пора|срок/i,
    );
  });

  await test.step("the page: the person, nothing under the name, no notes yet", async () => {
    await keepInTouchButton(page).click();
    await expect(
      page.getByRole("heading", { name: "Пора связаться", level: 1 }),
    ).toBeVisible();
    await expect(dueRows(page)).toHaveCount(1);
    // Right after the name comes "Заметок ещё нет": no "кто это", no dash
    await expect(dueRows(page)).toHaveText(
      new RegExp(`${name}\\s*Заметок ещё нет$`),
    );
  });

  await test.step("the row opens the card, which shows no «пора связаться»", async () => {
    await dueRows(page).getByRole("link").click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
    // The card itself: pages visited before stay hidden in the document
    const card = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name, level: 1 }) });
    await expect(card).toContainText("Как часто общаться");
    await expect(card).not.toContainText(/пора связаться/i);
  });

  await test.step("a note: the button has no number, the page is empty", async () => {
    await page
      .getByRole("textbox", { name: "Новая заметка" })
      .fill("Созвонились, договорились встретиться");
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();

    await page.goto("/");
    await expect(keepInTouchButton(page)).toHaveText("Пора связаться");
    await keepInTouchButton(page).click();
    await expect(page.getByText("Со всеми на связи")).toBeVisible();
    await expect(dueRows(page)).toHaveCount(0);
  });
});

test("own date: the «Своя дата» dialog, a wrong date, change and forget it", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = "Вера Иванова";
  const email = uniqueEmail("kit-date");
  await signIn(page, email);
  // Talked yesterday: not on the page
  const [id] = await replaceContacts(email, [
    {
      name,
      contactFrequency: "monthly",
      createdAt: daysAgo(30),
      notes: [{ createdAt: daysAgo(1) }],
    },
  ]);
  const today = await databaseDate();
  const tomorrow = await databaseDate(1);
  const dialog = page.getByRole("dialog", { name: "Своя дата" });
  const dateField = dialog.getByRole("textbox", { name: "День и месяц" });

  await page.goto(`/contacts/${id}`);

  await test.step("«Другое…» opens the dialog", async () => {
    await choose(page, "Другое…");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Год подставится сам — ближайшая такая дата."),
    ).toBeVisible();
    await expect(dateField).toHaveValue("");
    await expect(dateField).toHaveAttribute("placeholder", "например, 16.12");
    await expect(
      dialog.getByRole("button", { name: "Сохранить" }),
    ).toBeVisible();
  });

  await test.step("«Отмена» changes nothing", async () => {
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toBeHidden();
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
    await page.reload();
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
  });

  await test.step("a date that does not exist: the dialog stays", async () => {
    await choose(page, "Другое…");
    await dateField.fill("31.02");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(
      dialog.getByText(
        "Проверьте дату: день и месяц через точку, например 16.12",
      ),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dateField).toHaveValue("31.02");
  });

  await test.step("today's date: saved, and the person is on the page at once", async () => {
    await dateField.fill(typedDayMonth(today));
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(frequencyValue(page)).toHaveText(
      `Другое: ${shownDayMonth(today)}`,
    );

    await page.reload();
    await expect(frequencyValue(page)).toHaveText(
      `Другое: ${shownDayMonth(today)}`,
    );
    await inAnotherBrowser(browser, baseURL, email, async (other) => {
      await other.goto(`/contacts/${id}`);
      await expect(frequencyValue(other)).toHaveText(
        `Другое: ${shownDayMonth(today)}`,
      );
    });

    await page.goto("/keep-in-touch");
    await expect(dueRows(page)).toHaveText([new RegExp(name)]);
  });

  await test.step("«Другое…» again: the dialog has the date, change it", async () => {
    await page.goto(`/contacts/${id}`);
    await choose(page, "Другое…");
    await expect(dateField).toHaveValue(shownDayMonth(today));
    await dateField.fill(typedDayMonth(tomorrow));
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(frequencyValue(page)).toHaveText(
      `Другое: ${shownDayMonth(tomorrow)}`,
    );
  });

  await test.step("a frequency instead: the own date is forgotten", async () => {
    await untilSaved(page, () => choose(page, "Раз в месяц"));
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
    await choose(page, "Другое…");
    await expect(dateField).toHaveValue("");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(frequencyValue(page)).toHaveText("Раз в месяц");
  });
});

test("the page: order, rows, group filter, the number on the home page", async ({
  page,
  browser,
  baseURL,
}) => {
  const annaNoteAt = daysAgo(21);
  const email = uniqueEmail("kit-page");
  await signIn(page, email);
  await replaceContacts(email, [
    // 3 weeks at "Раз в неделю": overdue 3 times
    {
      name: "Анна Смирнова",
      about: "дизайнер интерфейсов",
      contactFrequency: "weekly",
      createdAt: daysAgo(100),
      groups: ["Друзья"],
      notes: [
        {
          createdAt: annaNoteAt,
          body:
            "Обсудили переезд в Казань, обещал прислать контакты риелтора. " +
            "Ещё поговорили про работу, детей, отпуск и общих знакомых. ".repeat(
              5,
            ),
        },
      ],
    },
    // Own date 2 months ago, no notes after it: overdue about 1.17 times
    {
      name: "Ира Белова",
      contactFrequency: "on_date",
      contactDate: await databaseDate(-61),
      contactDateSetAt: daysAgo(120),
      createdAt: daysAgo(200),
      groups: ["Друзья", "Семья"],
    },
    // 13 months at "Раз в год": overdue about 1.08 times
    {
      name: "Олег Петров",
      contactFrequency: "yearly",
      createdAt: daysAgo(500),
      groups: ["Теннис"],
      notes: [{ createdAt: daysAgo(396) }],
    },
    // No frequency: never on the page, however long ago
    {
      name: "Борис Кузнецов",
      createdAt: daysAgo(800),
      groups: ["Знакомые"],
      notes: [{ createdAt: daysAgo(730) }],
    },
  ]);
  const everyone = [/Анна Смирнова/, /Ира Белова/, /Олег Петров/];

  await test.step("the most overdue first; no frequency — not on the page", async () => {
    await page.goto("/keep-in-touch");
    await expect(dueRows(page)).toHaveText(everyone);
  });

  await test.step("a row: who it is, the date and the start of the last note", async () => {
    const anna = dueRows(page).filter({ hasText: "Анна Смирнова" });
    await expect(anna).toContainText("дизайнер интерфейсов");
    await expect(anna).toContainText(formatDate(annaNoteAt));
    await expect(anna).toContainText("Обсудили переезд в Казань");
  });

  await test.step("another browser: the same people in the same order", async () => {
    await inAnotherBrowser(browser, baseURL, email, async (other) => {
      await other.goto("/keep-in-touch");
      await expect(dueRows(other)).toHaveText(everyone);
    });
  });

  await test.step("«Друзья»: only them, in the same order, after a reload too", async () => {
    await groupLink(page, "Друзья").click();
    await expect(page).toHaveURL(/\?group=\d+$/);
    const friends = [/Анна Смирнова/, /Ира Белова/];
    await expect(dueRows(page)).toHaveText(friends);

    await page.reload();
    await expect(groupLink(page, "Друзья")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(dueRows(page)).toHaveText(friends);
  });

  await test.step("«Все» brings everyone back", async () => {
    await groupLink(page, "Все").click();
    await expect(dueRows(page)).toHaveText(everyone);
  });

  await test.step("a group where nobody is due", async () => {
    await groupLink(page, "Знакомые").click();
    await expect(
      page.getByText("В группе «Знакомые» сейчас никому не пора написать"),
    ).toBeVisible();
  });

  await test.step("home: the number counts everyone, whatever the filter", async () => {
    await groupLink(page, "Друзья").click();
    await expect(dueRows(page)).toHaveCount(2);
    await page.goto("/");
    await expect(keepInTouchButton(page)).toHaveText("Пора связаться · 3");
  });
});

// "Как часто общаться" in the card
function frequencyField(page: Page) {
  return page.getByRole("combobox", { name: "Как часто общаться" });
}

async function choose(page: Page, option: string) {
  await frequencyField(page).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// The value written in the field, without the arrow next to it
function frequencyValue(page: Page) {
  return frequencyField(page).locator('[data-slot="select-value"]');
}

// A frequency is saved in the background: waits until the server answers,
// so a reload shows what was saved
async function untilSaved(page: Page, act: () => Promise<void>) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await act();
  await saved;
}

// The "Пора связаться" button on the home page
function keepInTouchButton(page: Page) {
  return page.getByRole("link", { name: /^Пора связаться/ });
}

// The people on the "Пора связаться" page, top to bottom
function dueRows(page: Page) {
  return page.getByRole("main").getByRole("listitem");
}

// A button of the group row on the "Пора связаться" page
function groupLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Группы" })
    .getByRole("link", { name, exact: true });
}

// A separate browser profile: nothing shared with the first one. It signs
// in under the same email by a link of its own.
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

// "2026-11-07" -> "7.11", the way a person types it
function typedDayMonth(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day}.${month}`;
}

// "2026-11-07" -> "07.11", the way the card shows it
function shownDayMonth(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}
