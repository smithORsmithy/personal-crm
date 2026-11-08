"use client";

import { useRef, useState } from "react";

import {
  FrequencyOptions,
  NO_FREQUENCY_VALUE,
} from "@/components/frequency-options";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  contactFrequencies,
  frequencyLabels,
  NO_FREQUENCY_LABEL,
  type ContactFrequency,
} from "@/lib/contacts/frequency";

function isFrequency(value: string | undefined): value is ContactFrequency {
  return contactFrequencies.some((frequency) => frequency === value);
}

// "Как часто общаться" in the add form. Nothing is saved here: the choice
// travels with the form ("frequency", and "dayMonth" for «Другое…") and is
// saved with the contact by «Добавить контакт». «Другое…» shows the
// "День и месяц" field right under the list instead of the card's dialog.
export function ContactFrequencyField({
  defaultFrequency,
  defaultDayMonth,
  dayMonthError,
}: {
  // What was chosen and typed before a failed save
  defaultFrequency?: string;
  defaultDayMonth?: string;
  dayMonthError?: string;
}) {
  const [frequency, setFrequency] = useState(
    isFrequency(defaultFrequency) ? defaultFrequency : NO_FREQUENCY_VALUE,
  );
  const dateInput = useRef<HTMLInputElement>(null);
  // Set when «Другое…» is picked: the cursor goes to the date once the
  // list has closed, or the list would take the focus back
  const focusDate = useRef(false);

  function choose(value: string | null) {
    const next = value ?? NO_FREQUENCY_VALUE;
    focusDate.current = next === "on_date" && frequency !== "on_date";
    setFrequency(next);
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="frequency">Как часто общаться</FieldLabel>
        <Select
          name="frequency"
          value={frequency}
          onValueChange={choose}
          onOpenChangeComplete={(open) => {
            if (!open && focusDate.current) {
              focusDate.current = false;
              dateInput.current?.focus();
            }
          }}
        >
          <SelectTrigger id="frequency" className="sm:w-65">
            <SelectValue>
              {() =>
                isFrequency(frequency)
                  ? frequencyLabels[frequency]
                  : NO_FREQUENCY_LABEL
              }
            </SelectValue>
          </SelectTrigger>
          <FrequencyOptions />
        </Select>
      </Field>

      {/* Not in the form at all while another option is chosen: a date
          typed earlier is not sent and not saved */}
      {frequency === "on_date" && (
        <Field data-invalid={!!dayMonthError}>
          <FieldLabel htmlFor="dayMonth">День и месяц</FieldLabel>
          <Input
            ref={dateInput}
            id="dayMonth"
            name="dayMonth"
            defaultValue={defaultDayMonth}
            placeholder="например, 16.12"
            // Only a dot separates day and month, and the phone number pad
            // often has a comma instead, so the ordinary keyboard opens
            inputMode="text"
            autoComplete="off"
            maxLength={20}
            className="sm:w-65"
            aria-invalid={!!dayMonthError}
            aria-describedby={
              dayMonthError
                ? "dayMonth-description dayMonth-error"
                : "dayMonth-description"
            }
          />
          <FieldDescription id="dayMonth-description">
            Год подставится сам — ближайшая такая дата.
          </FieldDescription>
          <FieldError id="dayMonth-error">{dayMonthError}</FieldError>
        </Field>
      )}
    </>
  );
}
