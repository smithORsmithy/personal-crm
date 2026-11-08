"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db";

import { getCurrentUser } from "./current-user";
import { getAuth } from "./index";
import {
  invalidEmailMessage,
  sendFailedMessage,
  tooManyMessage,
} from "./messages";
import { requestSignInLink } from "./sign-in-request";

// The sign-in form. The typed text comes back with every answer, so it stays
// in the field.
export type SignInFormState = {
  input?: string;
  // Under the field: the address is wrong
  fieldError?: string;
  // Under the form: the limit is used up, or the email did not go
  formError?: string;
  // Under the form: the link was sent to this address
  sentTo?: string;
};

export async function requestSignInLinkAction(
  _prevState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  // The form in a tab opened before signing in in another tab: already
  // signed in, so to the list, as when opening the sign-in page
  if (await getCurrentUser()) {
    redirect("/");
  }

  const raw = formData.get("email");
  const input = typeof raw === "string" ? raw : "";

  const result = await requestSignInLink(
    getDb(),
    getAuth(),
    input,
    await headers(),
  );
  switch (result.status) {
    case "sent":
      return { input, sentTo: result.email };
    case "invalid":
      return { input, fieldError: invalidEmailMessage };
    case "too-many":
      return { input, formError: tooManyMessage };
    case "failed":
      return { input, formError: sendFailedMessage };
  }
}

// «Да, выйти»: ends the sign-in on this device only, other devices stay in
export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
