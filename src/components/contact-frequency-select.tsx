"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ContactDateFormState,
  ContactFrequencyState,
} from "@/lib/contacts/actions";
import {
  formatDayMonth,
  frequencyDisplay,
  frequencyLabels,
  NO_FREQUENCY_LABEL,
  regularFrequencies,
  type ContactFrequency,
  type RegularFrequency,
} from "@/lib/contacts/frequency";

type SetFrequencyAction = (
  frequency: RegularFrequency | null,
) => Promise<ContactFrequencyState>;

type SetDateAction = (
  state: ContactDateFormState,
  formData: FormData,
) => Promise<ContactDateFormState>;

type Choice = {
  frequency: ContactFrequency | null;
  contactDate: string | null;
};

// The select needs a value for "Не задано" too
const NONE = "none";

// "Как часто общаться" in the card. A frequency is saved as soon as it is
// chosen; "Другое…" opens the "Своя дата" dialog instead, every time,
// even when an own date is already set.
export function ContactFrequencySelect({
  frequency,
  contactDate,
  labelId,
  setFrequencyAction,
  setDateAction,
}: Choice & {
  // The visible label lives in the card's <dt>
  labelId: string;
  setFrequencyAction: SetFrequencyAction;
  setDateAction: SetDateAction;
}) {
  // The new value shows at once while it is being saved; on error the saved
  // one comes back by itself
  const [shown, setShown] = useOptimistic<Choice>({ frequency, contactDate });
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);

  function choose(value: string | null) {
    if (value === "on_date") {
      setError(undefined);
      setDialogOpen(true);
      return;
    }
    const next =
      value === NONE || value === null ? null : (value as RegularFrequency);
    if (next === shown.frequency) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      setShown({ frequency: next, contactDate: null });
      const result = await setFrequencyAction(next);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Select value={shown.frequency ?? NONE} onValueChange={choose}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-describedby={error ? `${labelId}-error` : undefined}
          className="sm:w-65"
        >
          <SelectValue>
            {() => frequencyDisplay(shown.frequency, shown.contactDate)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <SelectItem value={NONE}>{NO_FREQUENCY_LABEL}</SelectItem>
          {regularFrequencies.map((value) => (
            <SelectItem key={value} value={value}>
              {frequencyLabels[value]}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="on_date">{frequencyLabels.on_date}</SelectItem>
        </SelectContent>
      </Select>

      {error && (
        <p
          id={`${labelId}-error`}
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <ContactDateForm
            action={setDateAction}
            initialInput={contactDate ? formatDayMonth(contactDate) : ""}
            onSaved={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Lives inside the dialog, which unmounts when closed: the field opens
// with the saved date (or empty), and an old error is not shown again
function ContactDateForm({
  action,
  initialInput,
  onSaved,
}: {
  action: SetDateAction;
  initialInput: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prevState: ContactDateFormState, formData: FormData) => {
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
        <DialogTitle>Своя дата</DialogTitle>
        <DialogDescription>
          Год подставится сам — ближайшая такая дата.
        </DialogDescription>
      </DialogHeader>

      <Field data-invalid={!!state.error}>
        <FieldLabel htmlFor="contact-date">День и месяц</FieldLabel>
        <Input
          id="contact-date"
          name="dayMonth"
          // After an error React resets the form: what was typed comes back
          // from the server and becomes the new default
          defaultValue={state.input ?? initialInput}
          placeholder="например, 16.12"
          // Only a dot separates day and month, and the phone number pad
          // often has a comma instead, so the ordinary keyboard opens
          inputMode="text"
          autoComplete="off"
          maxLength={20}
          className="bg-background"
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "contact-date-error" : undefined}
        />
        <FieldError id="contact-date-error">{state.error}</FieldError>
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
