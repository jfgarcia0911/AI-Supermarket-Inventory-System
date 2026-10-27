"use client";

import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type FormState, initialFormState } from "@/lib/form-state";

export function OpeningStockForm({
  action,
  now,
  soldBy,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** London "YYYY-MM-DDTHH:mm". */
  now: string;
  soldBy: "each" | "kg";
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
    >
      <p className="text-sm font-medium">Set the opening stock</p>
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field
          className="w-36"
          data-invalid={Boolean(state.fieldErrors.quantity)}
        >
          <FieldLabel htmlFor="opening-quantity">
            {soldBy === "kg" ? "Kg counted" : "Quantity counted"}
          </FieldLabel>
          <Input
            id="opening-quantity"
            name="quantity"
            inputMode="decimal"
            required
            defaultValue={state.values?.quantity}
          />
        </Field>
        <Field
          className="w-56"
          data-invalid={Boolean(state.fieldErrors.counted_at)}
        >
          <FieldLabel htmlFor="opening-counted-at">
            Counted at (UK time)
          </FieldLabel>
          <Input
            id="opening-counted-at"
            name="counted_at"
            type="datetime-local"
            required
            defaultValue={state.values?.counted_at ?? now}
          />
        </Field>
        <SubmitButton variant="secondary" pendingText="Saving…">
          Save opening stock
        </SubmitButton>
      </div>
      <FieldErrors state={state} name="quantity" />
      <FieldErrors state={state} name="counted_at" />
    </form>
  );
}
