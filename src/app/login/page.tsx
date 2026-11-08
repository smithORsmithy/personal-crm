import type { Metadata } from "next";

import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 py-6 sm:py-10">
      <h1 className="text-title lg:text-title-lg">Вход</h1>
      <SignInForm />
    </div>
  );
}
