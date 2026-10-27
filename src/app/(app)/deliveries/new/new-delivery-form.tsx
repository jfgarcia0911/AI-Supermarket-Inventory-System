"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/form-state";

import { createDelivery } from "../actions";

export function NewDeliveryForm({
  suppliers,
  now,
  supplierId,
}: {
  suppliers: { id: string; name: string }[];
  /** London "YYYY-MM-DDTHH:mm" for the arrival time. */
  now: string;
  supplierId?: string;
}) {
  const [state, formAction] = useActionState(createDelivery, initialFormState);
  const value = (key: string, fallback = "") => state.values?.[key] ?? fallback;

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.supplier_id)}>
          <FieldLabel htmlFor="supplier_id">Supplier</FieldLabel>
          <NativeSelect
            id="supplier_id"
            name="supplier_id"
            required
            defaultValue={value("supplier_id", supplierId ?? "")}
          >
            <NativeSelectOption value="">Choose a supplier…</NativeSelectOption>
            {suppliers.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldErrors state={state} name="supplier_id" />
        </Field>

        <Field>
          <FieldLabel>What is it?</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              [
                "invoice",
                "Goods arriving",
                "A delivery with an invoice or delivery note.",
              ],
              [
                "credit_note",
                "Goods going back",
                "A return to the supplier, with a credit note.",
              ],
            ].map(([option, title, help]) => (
              <label
                key={option}
                className="flex cursor-pointer gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted/50"
              >
                <input
                  type="radio"
                  name="document_type"
                  value={option}
                  defaultChecked={value("document_type", "invoice") === option}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="text-xs text-muted-foreground">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.delivered_at)}>
          <FieldLabel htmlFor="delivered_at">
            When did it arrive (or leave)?
          </FieldLabel>
          <Input
            id="delivered_at"
            name="delivered_at"
            type="datetime-local"
            required
            className="max-w-60"
            defaultValue={value("delivered_at", now)}
          />
          <FieldDescription>
            UK time. Stock changes are dated with this.
          </FieldDescription>
          <FieldErrors state={state} name="delivered_at" />
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.notes)}>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={value("notes")}
          />
          <FieldErrors state={state} name="notes" />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <SubmitButton pendingText="Starting…">
          Start checking it in
        </SubmitButton>
        <Button variant="outline" render={<Link href="/deliveries" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
