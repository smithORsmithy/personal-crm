"use client";

import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { NoteFormState } from "@/lib/contacts/actions";

export function NoteForm({
  action,
}: {
  action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="note-body" className="sr-only">
        Новая заметка
      </label>
      <Textarea
        id="note-body"
        name="body"
        // On error the text comes back from the server, on success it is cleared
        defaultValue={state.body ?? ""}
        placeholder="О чём поговорили, о чём договорились…"
        required
        maxLength={10_000}
        rows={3}
        className="min-h-24 bg-background"
        aria-invalid={!!state.error}
        aria-describedby={state.error ? "note-error" : undefined}
        onKeyDown={(event) => {
          // Ctrl+Enter (Cmd+Enter on Mac) saves the note
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {state.error && (
        <p id="note-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
        {state.savedAt && !pending ? (
          <span
            role="status"
            className="flex items-center gap-1 text-sm font-bold text-success"
          >
            <CheckIcon className="size-4" aria-hidden />
            Заметка сохранена
          </span>
        ) : (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Ctrl+Enter — сохранить
          </span>
        )}
      </div>
    </form>
  );
}
