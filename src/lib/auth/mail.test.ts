import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

import { buildSignInEmail } from "./mail";

const from = '"Личная CRM" <noreply@mail.crm.linkbook.site>';
const url = "https://app.linkbook.site/api/auth/magic-link/verify?token=abc";

// The real Nodemailer builds the whole message, but nothing leaves the
// computer: jsonTransport hands the finished message back
async function build() {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const info = await transport.sendMail(
    buildSignInEmail({ to: "anna@example.com", url, from }),
  );
  return JSON.parse(info.message as string) as {
    from: { name: string; address: string };
    to: { address: string }[];
    subject: string;
    html: string;
    text: string;
  };
}

describe("Что в письме", () => {
  it("is sent from «Личная CRM» <noreply@mail.crm.linkbook.site>", async () => {
    const message = await build();
    expect(message.from).toEqual({
      name: "Личная CRM",
      address: "noreply@mail.crm.linkbook.site",
    });
    expect(message.to).toEqual([{ address: "anna@example.com", name: "" }]);
  });

  it("has the subject «Вход в Личную CRM»", async () => {
    expect((await build()).subject).toBe("Вход в Личную CRM");
  });

  it("has the button «Войти» with the link, the 15 minutes and the ignore line", async () => {
    const { html } = await build();
    expect(html).toMatch(/<a [^>]*href="[^"]*magic-link\/verify\?token=abc"/);
    expect(html).toContain("Войти");
    expect(html).toContain("15 минут");
    expect(html).toContain(
      "Если вы не запрашивали вход — просто проигнорируйте письмо",
    );
  });

  it("has the same link, the 15 minutes and the ignore line in the text version", async () => {
    const { text } = await build();
    expect(text).toContain(url);
    expect(text).toContain("15 минут");
    expect(text).toContain(
      "Если вы не запрашивали вход — просто проигнорируйте письмо",
    );
  });

  it("escapes the link in the HTML", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const info = await transport.sendMail(
      buildSignInEmail({
        to: "anna@example.com",
        url: 'https://x.test/?a=1&b="2"',
        from,
      }),
    );
    const { html } = JSON.parse(info.message as string) as { html: string };
    expect(html).toContain("a=1&amp;b=&quot;2&quot;");
  });
});
