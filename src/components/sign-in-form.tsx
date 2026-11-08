"use client";

import { useActionState } from "react";
import { MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestSignInLinkAction,
  type SignInFormState,
} from "@/lib/auth/actions";
import { sentMessage } from "@/lib/auth/messages";

// The email field and «Получить ссылку». The form stays after sending: the
// address can be corrected and the link asked for once more.
export function SignInForm() {
  const [state, formAction, pending] = useActionState<
    SignInFormState,
    FormData
  >(requestSignInLinkAction, {});

  return (
    <form
      action={formAction}
      // The checks are the server's: its message is shown, not the browser's
      noValidate
      className="flex flex-col gap-3"
    >
      <label htmlFor="sign-in-email" className="text-sm font-bold">
        Почта
      </label>
      <Input
        id="sign-in-email"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        // The typed text comes back from the server with every answer
        defaultValue={state.input ?? ""}
        aria-invalid={!!state.fieldError}
        aria-describedby={state.fieldError ? "sign-in-email-error" : undefined}
        className="bg-card"
      />
      {state.fieldError && (
        <p
          id="sign-in-email-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {state.fieldError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        <MailIcon />
        {pending ? "Отправляю…" : "Получить ссылку"}
      </Button>
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.sentTo && !pending && (
        <p role="status" className="text-sm font-bold text-success">
          {sentMessage(state.sentTo)}
        </p>
      )}
    </form>
  );
}
