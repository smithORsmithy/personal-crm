"use client";

import { useActionState, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DeleteGroupState, GroupFormState } from "@/lib/groups/actions";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/groups/names";
import { deleteGroupQuestion } from "@/lib/groups/text";

type RenameAction = (
  state: GroupFormState,
  formData: FormData,
) => Promise<GroupFormState>;

type DeleteAction = () => Promise<DeleteGroupState>;

// "Переименовать" and "Удалить" of one row on the "Группы" page. On a phone
// the buttons are icons only; the name is for screen readers.
export function GroupRowActions({
  groupId,
  groupName,
  contactCount,
  renameAction,
  deleteAction,
}: {
  groupId: number;
  groupName: string;
  contactCount: number;
  renameAction: RenameAction;
  deleteAction: DeleteAction;
}) {
  return (
    <div className="flex shrink-0 gap-1 sm:gap-2">
      <RenameGroupButton
        groupId={groupId}
        groupName={groupName}
        action={renameAction}
      />
      <DeleteGroupButton
        groupName={groupName}
        contactCount={contactCount}
        action={deleteAction}
      />
    </div>
  );
}

function RenameGroupButton({
  groupId,
  groupName,
  action,
}: {
  groupId: number;
  groupName: string;
  action: RenameAction;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="max-sm:size-9" />}
      >
        <PencilIcon />
        <span className="max-sm:sr-only">Переименовать</span>
        <span className="sr-only sm:hidden">группу «{groupName}»</span>
      </DialogTrigger>
      <DialogContent>
        <RenameGroupForm
          key={groupId}
          groupName={groupName}
          action={action}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// Lives inside the dialog, which unmounts when closed: the field opens
// with the current name, and an old error is not shown again
function RenameGroupForm({
  groupName,
  action,
  onSaved,
}: {
  groupName: string;
  action: RenameAction;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prevState: GroupFormState, formData: FormData) => {
      const result = await action(prevState, formData);
      if (!result.error) {
        onSaved();
      }
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Переименовать группу</DialogTitle>
      </DialogHeader>

      <Field data-invalid={!!state.error}>
        <FieldLabel htmlFor="rename-group-name">Название</FieldLabel>
        <Input
          id="rename-group-name"
          name="name"
          // After an error React resets the form: what was typed comes back
          // from the server and becomes the new default
          defaultValue={state.input ?? groupName}
          autoComplete="off"
          maxLength={GROUP_NAME_MAX_LENGTH}
          className="bg-background"
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "rename-group-error" : undefined}
        />
        <FieldError id="rename-group-error">{state.error}</FieldError>
      </Field>

      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" className="max-sm:h-11" />}
          disabled={pending}
        >
          Отмена
        </DialogClose>
        <Button type="submit" disabled={pending} className="max-sm:h-11">
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteGroupButton({
  groupName,
  contactCount,
  action,
}: {
  groupName: string;
  contactCount: number;
  action: DeleteAction;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={buttonVariants({
          variant: "destructive",
          size: "sm",
          className: "max-sm:size-9",
        })}
      >
        <Trash2Icon />
        <span className="max-sm:sr-only">Удалить</span>
        <span className="sr-only sm:hidden">группу «{groupName}»</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <DeleteGroupForm
          action={action}
          groupName={groupName}
          contactCount={contactCount}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Lives inside the dialog, which unmounts when closed: an old error
// is not shown again when the dialog is opened next time
function DeleteGroupForm({
  action,
  groupName,
  contactCount,
}: {
  action: DeleteAction;
  groupName: string;
  contactCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Удалить группу «{groupName}»?</AlertDialogTitle>
        <AlertDialogDescription>
          {deleteGroupQuestion(contactCount)}
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
          {pending ? "Удаляю…" : "Удалить группу"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
