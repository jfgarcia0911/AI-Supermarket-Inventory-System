"use client";

import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form-state";

import { changePassword } from "../actions";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePassword, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
          <FieldDescription>
            At least 10 characters, with letters and numbers.
          </FieldDescription>
          <FieldErrors state={state} name="password" />
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors.confirm)}>
          <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
          <FieldErrors state={state} name="confirm" />
        </Field>
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Saving…">
        Save password
      </SubmitButton>
    </form>
  );
}
