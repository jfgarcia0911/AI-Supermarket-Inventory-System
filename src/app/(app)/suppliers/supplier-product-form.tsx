"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type FormState, initialFormState } from "@/lib/form-state";

export interface SupplierProductFormValues {
  product_code: string;
  supplier_code: string | null;
  supplier_description: string | null;
  units_per_case: number;
  is_preferred: boolean;
}

/** Adds one of our products to a supplier, or edits the link. */
export function SupplierProductForm({
  action,
  link,
  showCost,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  link?: SupplierProductFormValues;
  showCost: boolean;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const value = (key: keyof SupplierProductFormValues | "case_cost") =>
    state.values?.[key] ??
    (link && key !== "case_cost"
      ? String(link[key as keyof SupplierProductFormValues] ?? "")
      : "");

  const input = (
    name: string,
    label: string,
    props: React.ComponentProps<typeof Input>,
    help?: string,
  ) => (
    <Field data-invalid={Boolean(state.fieldErrors[name])}>
      <FieldLabel htmlFor={`sp-${name}`}>{label}</FieldLabel>
      <Input
        id={`sp-${name}`}
        name={name}
        defaultValue={value(name as "case_cost")}
        {...props}
      />
      {help && <FieldDescription>{help}</FieldDescription>}
      <FieldErrors state={state} name={name} />
    </Field>
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {input(
          "product_code",
          "Our barcode or till code",
          { required: true, autoComplete: "off", inputMode: "numeric" },
          "Scan the product or type its till code.",
        )}
        {input("supplier_code", "Their code", {
          maxLength: 40,
          autoComplete: "off",
        })}
        {input(
          "units_per_case",
          "Units per case",
          { required: true, inputMode: "decimal" },
          "kg per box for loose items.",
        )}
        {input("supplier_description", "Their description", { maxLength: 200 })}
        {showCost &&
          input(
            "case_cost",
            link ? "New case cost (£, ex VAT)" : "Case cost (£, ex VAT)",
            { inputMode: "decimal" },
            link ? "Leave blank to keep the current cost." : "Optional.",
          )}
      </div>
      <Field orientation="horizontal">
        <Checkbox
          id="sp-is_preferred"
          name="is_preferred"
          value="on"
          defaultChecked={
            state.values
              ? Boolean(state.values.is_preferred)
              : (link?.is_preferred ?? false)
          }
        />
        <FieldLabel htmlFor="sp-is_preferred">
          Preferred supplier for this product
        </FieldLabel>
      </Field>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">
          {link ? "Save changes" : "Add product"}
        </SubmitButton>
        {cancelHref && (
          <Button variant="outline" render={<Link href={cancelHref} />}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
