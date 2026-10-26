"use client";

import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type FormState, initialFormState } from "@/lib/form-state";

export function NameForm({
  action,
  fullName,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fullName: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="max-w-md space-y-3">
      <FormMessage state={state} />
      <Field data-invalid={Boolean(state.fieldErrors.full_name)}>
        <FieldLabel htmlFor="full_name">Your name</FieldLabel>
        <Input
          id="full_name"
          name="full_name"
          required
          maxLength={100}
          defaultValue={state.values?.full_name ?? fullName}
        />
        <FieldErrors state={state} name="full_name" />
      </Field>
      <SubmitButton pendingText="Saving…">Save name</SubmitButton>
    </form>
  );
}
