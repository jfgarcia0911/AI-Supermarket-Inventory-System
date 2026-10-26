"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form-state";

import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordReset,
    initialFormState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values?.email}
          />
          <FieldErrors state={state} name="email" />
        </Field>
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Sending…">
        Email me a link
      </SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
