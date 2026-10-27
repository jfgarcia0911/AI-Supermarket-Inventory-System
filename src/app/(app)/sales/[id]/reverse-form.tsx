"use client";

import { useActionState } from "react";
import { toast } from "sonner";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/lib/form-state";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ReverseForm({ action }: { action: Action }) {
  // Reversing removes this form, so the success message is a toast.
  const [state, formAction] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok && result.message) toast.success(result.message);
      return result;
    },
    initialFormState,
  );
  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <FormMessage state={state} />
      <Field data-invalid={Boolean(state.fieldErrors.reason)}>
        <FieldLabel htmlFor="reverse-reason">
          Why is it being reversed?
        </FieldLabel>
        <Textarea
          id="reverse-reason"
          name="reason"
          rows={2}
          maxLength={300}
          required
          defaultValue={state.values?.reason}
        />
        <FieldDescription>
          Every stock change this import made is undone, and its days can be
          imported again, for example from a corrected file.
        </FieldDescription>
        <FieldErrors state={state} name="reason" />
      </Field>
      <SubmitButton variant="destructive" pendingText="Reversing…">
        Reverse this import
      </SubmitButton>
    </form>
  );
}
