"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContactFormState } from "@/lib/contacts/actions";
import {
  emptyContactValues,
  type ContactField,
  type ContactFormValues,
} from "@/lib/contacts/form-values";

export function ContactForm({
  action,
  defaultValues = emptyContactValues,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (
    state: ContactFormState,
    formData: FormData,
  ) => Promise<ContactFormState>;
  defaultValues?: ContactFormValues;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a failed save React resets the form, so the typed values
  // come back from the server and become the new defaults
  const values = state.values ?? defaultValues;
  const errorOf = (field: ContactField) => state.errors?.[field]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={!!errorOf("name")}>
          <FieldLabel htmlFor="name">
            Имя <span className="text-muted-foreground">(обязательно)</span>
          </FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            placeholder="Например, Анна Смирнова"
            required
            autoFocus
            maxLength={200}
            autoComplete="off"
            aria-invalid={!!errorOf("name")}
          />
          <FieldError>{errorOf("name")}</FieldError>
        </Field>

        <Field data-invalid={!!errorOf("about")}>
          <FieldLabel htmlFor="about">Кто это</FieldLabel>
          <Input
            id="about"
            name="about"
            defaultValue={values.about}
            placeholder="Например, дизайнер в студии, сосед по даче"
            maxLength={500}
            autoComplete="off"
            aria-invalid={!!errorOf("about")}
          />
          <FieldError>{errorOf("about")}</FieldError>
        </Field>

        <Field data-invalid={!!errorOf("howWeMet")}>
          <FieldLabel htmlFor="howWeMet">Откуда знакомы</FieldLabel>
          <Textarea
            id="howWeMet"
            name="howWeMet"
            defaultValue={values.howWeMet}
            placeholder="Например, вместе учились в университете"
            maxLength={1000}
            rows={2}
            aria-invalid={!!errorOf("howWeMet")}
          />
          <FieldError>{errorOf("howWeMet")}</FieldError>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errorOf("phone")}>
            <FieldLabel htmlFor="phone">Телефон</FieldLabel>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              placeholder="+7 900 123-45-67"
              maxLength={50}
              autoComplete="off"
              aria-invalid={!!errorOf("phone")}
            />
            <FieldError>{errorOf("phone")}</FieldError>
          </Field>

          <Field data-invalid={!!errorOf("email")}>
            <FieldLabel htmlFor="email">Почта</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
              placeholder="anna@example.com"
              maxLength={254}
              autoComplete="off"
              aria-invalid={!!errorOf("email")}
            />
            <FieldError>{errorOf("email")}</FieldError>
          </Field>
        </div>
      </FieldGroup>

      {state.message && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
