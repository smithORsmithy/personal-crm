"use client";

import { useActionState, useEffect, useState } from "react";
import { Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

// "… удалён." with "Отменить (5)" counting down to zero. Used for deleted
// contacts and deleted groups. The time left comes from the server, so the
// browser clock does not matter.
export function UndoNotice({
  message,
  undoMsLeft,
  restoreAction,
}: {
  message: string;
  undoMsLeft: number;
  restoreAction: () => Promise<{ error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(restoreAction, {});
  const [msLeft, setMsLeft] = useState(undoMsLeft);

  useEffect(() => {
    const deadline = Date.now() + undoMsLeft;
    const timer = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setMsLeft(left);
      if (left === 0) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [undoMsLeft]);

  // Once clicked, the button stays until the server answers
  const canUndo = (msLeft > 0 || pending) && !state.error;

  return (
    // Only the text is a live region: screen readers should not read
    // the countdown out every second
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-accent/30 bg-highlight px-4 py-3 text-sm text-ink-2">
      <p role="status" className="min-w-0 break-words">
        {message}
      </p>
      {canUndo && (
        <form action={formAction}>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            <Undo2Icon />
            {pending ? "Возвращаю…" : `Отменить (${Math.ceil(msLeft / 1000)})`}
          </Button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="basis-full text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
