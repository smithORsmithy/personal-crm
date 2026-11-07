// Sign-in emails: the transport (Nodemailer, where the mail goes is set by
// SMTP_URL) and the message itself. No Next.js here, so tests run it as is.

import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

// Where the mail goes is a setting, not code: Mailpit (a fake mailbox) on a
// computer and in tests, Resend over SMTP on the server
export function createMailer(smtpUrl: string): Mail {
  return nodemailer.createTransport(smtpUrl);
}

export const SIGN_IN_SUBJECT = "Вход в Личную CRM";
export const SIGN_IN_LINK_MINUTES = 15;
const IGNORE_LINE =
  "Если вы не запрашивали вход — просто проигнорируйте письмо";

// Mail programs do not understand CSS variables, so the values of the design
// tokens (src/styles/tokens.css) are written out here, in one place:
// --color-paper, --color-sheet, --color-ink, --color-paper (button text),
// --color-muted-foreground, --color-divider as a plain color, --radius-xl.
const colors = {
  page: "#f6f2ea",
  card: "#fbf8f2",
  ink: "#1e1d1a",
  buttonText: "#f6f2ea",
  muted: "#6b6458",
  divider: "#d2cfc8",
};
const radius = "6px";
const fontFamily =
  "Manrope, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildSignInEmail({
  to,
  url,
  from,
}: {
  to: string;
  url: string;
  from: string;
}): Mail.Options {
  const link = escapeHtml(url);
  const validity = `Ссылка работает ${SIGN_IN_LINK_MINUTES} минут и только один раз.`;

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px 12px;background:${colors.page};font-family:${fontFamily};color:${colors.ink};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="background:${colors.card};border-radius:${radius};padding:28px 24px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.2;">Вход в Личную CRM</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Нажмите кнопку, чтобы войти. ${validity}</p>
          <p style="margin:0 0 24px;">
            <a href="${link}" style="display:inline-block;background:${colors.ink};color:${colors.buttonText};text-decoration:none;font-weight:700;font-size:16px;padding:12px 28px;border-radius:999px;">Войти</a>
          </p>
          <p style="margin:0;padding-top:16px;border-top:1px dashed ${colors.divider};font-size:14px;line-height:1.5;color:${colors.muted};">${IGNORE_LINE}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    SIGN_IN_SUBJECT,
    "",
    `Чтобы войти, откройте ссылку. ${validity}`,
    "",
    url,
    "",
    IGNORE_LINE,
  ].join("\n");

  return { from, to, subject: SIGN_IN_SUBJECT, html, text };
}
