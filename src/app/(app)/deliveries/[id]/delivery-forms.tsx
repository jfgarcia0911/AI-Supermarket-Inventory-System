"use client";

import { useActionState } from "react";
import { toast } from "sonner";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/lib/form-state";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** A charge on the invoice that is not stock: delivery, a deposit… */
export function ChargeForm({
  action,
  vatRates,
}: {
  action: Action;
  vatRates: { code: string; rate_pct: number }[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field
          className="min-w-48 flex-1"
          data-invalid={Boolean(state.fieldErrors.description)}
        >
          <FieldLabel htmlFor="charge-description">Charge</FieldLabel>
          <Input
            id="charge-description"
            name="description"
            placeholder="e.g. Delivery charge"
            maxLength={200}
            defaultValue={state.values?.description}
          />
        </Field>
        <Field
          className="w-32"
          data-invalid={Boolean(state.fieldErrors.net_amount)}
        >
          <FieldLabel htmlFor="charge-amount">Before VAT £</FieldLabel>
          <Input
            id="charge-amount"
            name="net_amount"
            inputMode="decimal"
            defaultValue={state.values?.net_amount}
          />
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor="charge-vat">VAT</FieldLabel>
          <NativeSelect
            id="charge-vat"
            name="vat_rate_pct"
            defaultValue={state.values?.vat_rate_pct ?? "20"}
          >
            {vatRates.map((rate) => (
              <NativeSelectOption key={rate.code} value={String(rate.rate_pct)}>
                {rate.rate_pct}%
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <SubmitButton variant="outline" pendingText="Adding…">
          Add charge
        </SubmitButton>
      </div>
      <FieldErrors state={state} name="description" />
      <FieldErrors state={state} name="net_amount" />
    </form>
  );
}

export function FileUploadForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-2">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-60 flex-1">
          <FieldLabel htmlFor="delivery-file">
            Photo or PDF of the paperwork
          </FieldLabel>
          <Input
            id="delivery-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            capture="environment"
            required
          />
        </Field>
        <SubmitButton variant="outline" pendingText="Uploading…">
          Add file
        </SubmitButton>
      </div>
    </form>
  );
}

export function VoidForm({ action }: { action: Action }) {
  // Voiding removes this form, so a success message is shown as a toast.
  const [state, formAction] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok && result.message) toast.success(result.message);
      return result;
    },
    initialFormState,
  );
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <Field data-invalid={Boolean(state.fieldErrors.reason)}>
        <FieldLabel htmlFor="void-reason">Why is it being voided?</FieldLabel>
        <Textarea
          id="void-reason"
          name="reason"
          rows={2}
          maxLength={300}
          required
          defaultValue={state.values?.reason}
        />
        <FieldErrors state={state} name="reason" />
      </Field>
      <SubmitButton variant="destructive" pendingText="Voiding…">
        Void this delivery
      </SubmitButton>
    </form>
  );
}
