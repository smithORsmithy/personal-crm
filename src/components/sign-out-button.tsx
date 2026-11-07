"use client";

import { useActionState } from "react";
import { LogOutIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

// «Выйти» asks «Вы уверены?» first. «Нет, вернуться» (and Esc) closes the
// window and nothing goes to the server; «Да, выйти» ends the sign-in on
// this device only.
export function SignOutButton() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <LogOutIcon />
        Выйти
      </AlertDialogTrigger>
      <AlertDialogContent>
        <SignOutForm />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SignOutForm() {
  const [, formAction, pending] = useActionState(signOut, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Нет, вернуться</AlertDialogCancel>
        <Button type="submit" disabled={pending}>
          {pending ? "Выхожу…" : "Да, выйти"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
