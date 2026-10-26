"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { type FormState, initialFormState } from "@/lib/form-state";

export interface CategoryFormValues {
  name: string;
  parent_id: string | null;
  target_margin_pct: number | null;
  expiry_warning_days: number | null;
  active: boolean;
}

/** Without `category` this is the compact "add" form; with it, the full edit form. */
export function CategoryForm({
  action,
  parents,
  category,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  parents: { id: string; path: string }[];
  category?: CategoryFormValues;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const value = (key: keyof CategoryFormValues) =>
    state.values?.[key] ?? (category ? String(category[key] ?? "") : "");

  const nameAndParent = (
    <>
      <Field data-invalid={Boolean(state.fieldErrors.name)}>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={value("name")}
        />
        <FieldErrors state={state} name="name" />
      </Field>
      <Field data-invalid={Boolean(state.fieldErrors.parent_id)}>
        <FieldLabel htmlFor="parent_id">Inside</FieldLabel>
        <NativeSelect
          id="parent_id"
          name="parent_id"
          defaultValue={value("parent_id")}
        >
          <NativeSelectOption value="">
            Nothing (a top-level department)
          </NativeSelectOption>
          {parents.map((parent) => (
            <NativeSelectOption key={parent.id} value={parent.id}>
              {parent.path}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldErrors state={state} name="parent_id" />
      </Field>
    </>
  );

  if (!category) {
    return (
      <form action={formAction} className="space-y-3">
        <FormMessage state={state} />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          {nameAndParent}
          <SubmitButton className="sm:mt-6" pendingText="Adding…">
            Add category
          </SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormMessage state={state} />
      <FieldGroup>
        {nameAndParent}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(state.fieldErrors.target_margin_pct)}>
            <FieldLabel htmlFor="target_margin_pct">
              Target margin (%)
            </FieldLabel>
            <Input
              id="target_margin_pct"
              name="target_margin_pct"
              inputMode="decimal"
              defaultValue={value("target_margin_pct")}
            />
            <FieldDescription>
              Used for margin alerts in a later release.
            </FieldDescription>
            <FieldErrors state={state} name="target_margin_pct" />
          </Field>
          <Field data-invalid={Boolean(state.fieldErrors.expiry_warning_days)}>
            <FieldLabel htmlFor="expiry_warning_days">
              Expiry warning (days)
            </FieldLabel>
            <Input
              id="expiry_warning_days"
              name="expiry_warning_days"
              inputMode="numeric"
              defaultValue={value("expiry_warning_days")}
            />
            <FieldDescription>
              Warn this many days before products expire.
            </FieldDescription>
            <FieldErrors state={state} name="expiry_warning_days" />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id="active"
            name="active"
            value="on"
            defaultChecked={
              state.values ? Boolean(state.values.active) : category.active
            }
          />
          <FieldLabel htmlFor="active">Active</FieldLabel>
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <Button variant="outline" render={<Link href="/categories" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
