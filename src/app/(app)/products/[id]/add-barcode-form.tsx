"use client";

import { useActionState, useState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { type FormState, initialFormState } from "@/lib/form-state";

export function AddBarcodeForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [packType, setPackType] = useState("unit");

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <Field data-invalid={Boolean(state.fieldErrors.barcode)}>
          <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
          <Input
            id="barcode"
            name="barcode"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Scan or type"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pack_type">Type</FieldLabel>
          <NativeSelect
            id="pack_type"
            name="pack_type"
            value={packType}
            onChange={(event) => setPackType(event.target.value)}
          >
            <NativeSelectOption value="unit">Single item</NativeSelectOption>
            <NativeSelectOption value="case">Case</NativeSelectOption>
            <NativeSelectOption value="outer">Outer</NativeSelectOption>
          </NativeSelect>
        </Field>
        {packType !== "unit" && (
          <Field data-invalid={Boolean(state.fieldErrors.units_per_pack)}>
            <FieldLabel htmlFor="units_per_pack">Items in it</FieldLabel>
            <Input
              id="units_per_pack"
              name="units_per_pack"
              inputMode="decimal"
              className="w-24"
              required
            />
          </Field>
        )}
        <SubmitButton variant="secondary" pendingText="Adding…">
          Add barcode
        </SubmitButton>
      </div>
      <FieldErrors state={state} name="barcode" />
      <FieldErrors state={state} name="units_per_pack" />
    </form>
  );
}
