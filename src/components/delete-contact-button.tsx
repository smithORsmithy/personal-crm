"use client";

import { useActionState } from "react";
import { Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DeleteContactState } from "@/lib/contacts/actions";
import { UNDO_SECONDS } from "@/lib/contacts/undo-window";

type DeleteAction = () => Promise<DeleteContactState>;

export function DeleteContactButton({
  action,
  contactName,
  notesCount,
}: {
  action: DeleteAction;
  contactName: string;
  notesCount: number;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger className={buttonVariants({ variant: "destructive" })}>
        <Trash2Icon />
        Удалить
      </AlertDialogTrigger>
      <AlertDialogContent>
        <DeleteContactForm
          action={action}
          contactName={contactName}
          notesCount={notesCount}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Lives inside the dialog, which unmounts when closed: an old error
// is not shown again when the dialog is opened next time
function DeleteContactForm({
  action,
  contactName,
  notesCount,
}: {
  action: DeleteAction;
  contactName: string;
  notesCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Удалить контакт «{contactName}»?</AlertDialogTitle>
        <AlertDialogDescription>
          {notesCount > 0 && "Вместе с ним удалятся заметки. "}
          {/* Non-breaking spaces: a line must not start with the dash
              or with the word "секунд" */}
          {`Передумаете — сможете отменить в течение ${UNDO_SECONDS} секунд.`}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          <Trash2Icon />
          {pending ? "Удаляю…" : "Удалить"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
