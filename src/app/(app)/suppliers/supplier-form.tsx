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
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/lib/form-state";

export interface SupplierFormValues {
  name: string;
  account_number: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number | null;
  delivery_days: string | null;
  lead_time_days: number;
  notes: string | null;
}

export function SupplierForm({
  action,
  supplier,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  supplier?: SupplierFormValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const value = (key: keyof SupplierFormValues) =>
    state.values?.[key] ??
    (supplier
      ? String(supplier[key] ?? "")
      : key === "lead_time_days"
        ? "1"
        : "");

  const text = (
    name: keyof SupplierFormValues,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    description?: string,
  ) => (
    <Field data-invalid={Boolean(state.fieldErrors[name])}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} defaultValue={value(name)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldErrors state={state} name={name} />
    </Field>
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormMessage state={state} />
      <FieldGroup>
        {text("name", "Name", { required: true, maxLength: 120 })}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("account_number", "Our account number", { maxLength: 40 })}
          {text("contact_name", "Contact name", { maxLength: 100 })}
          {text("phone", "Phone", { type: "tel", maxLength: 40 })}
          {text("email", "Email", { type: "email" })}
          {text("delivery_days", "Delivery days", {
            maxLength: 60,
            placeholder: "e.g. Tue, Fri",
          })}
          {text(
            "lead_time_days",
            "Lead time (days)",
            { inputMode: "numeric" },
            "Days from ordering to delivery.",
          )}
          {text("payment_terms_days", "Payment terms (days)", {
            inputMode: "numeric",
          })}
        </div>
        <Field data-invalid={Boolean(state.fieldErrors.notes)}>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            maxLength={2000}
            rows={3}
            defaultValue={value("notes")}
          />
          <FieldErrors state={state} name="notes" />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">
          {supplier ? "Save changes" : "Add supplier"}
        </SubmitButton>
        <Button variant="outline" render={<Link href={cancelHref} />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
