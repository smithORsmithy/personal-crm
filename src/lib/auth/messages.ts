// Texts of the sign-in form. Apart from actions.ts: a "use server" file may
// export only async functions.

export const invalidEmailMessage = "Проверьте адрес почты";
export const tooManyMessage = "Слишком часто, попробуйте через несколько минут";
export const sendFailedMessage =
  "Не получилось отправить письмо. Попробуйте ещё раз через минуту";

export function sentMessage(email: string): string {
  return `Ссылка для входа отправлена на ${email}`;
}
