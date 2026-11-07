"use client";

import { useActionState } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupFormState } from "@/lib/groups/actions";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/groups/names";

// "Новая группа" on the "Группы" page
export function NewGroupForm({
  action,
}: {
  action: (
    state: GroupFormState,
    formData: FormData,
  ) => Promise<GroupFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="new-group-name" className="text-sm font-bold">
        Новая группа
      </label>
      <div className="flex gap-2">
        <Input
          id="new-group-name"
          name="name"
          // On error the text comes back from the server, on success the
          // field is cleared
          defaultValue={state.input ?? ""}
          placeholder="Например, Йога"
          autoComplete="off"
          maxLength={GROUP_NAME_MAX_LENGTH}
          className="bg-card"
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "new-group-error" : undefined}
        />
        <Button type="submit" size="lg" disabled={pending}>
          <PlusIcon />
          {pending ? "Создаю…" : "Создать"}
        </Button>
      </div>
      {state.error && (
        <p
          id="new-group-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
