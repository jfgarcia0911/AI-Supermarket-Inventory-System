"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

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
import {
  COUNT_SCOPE_DESCRIPTIONS,
  COUNT_SCOPE_LABELS,
  type CountScope,
} from "@/lib/counts";
import { initialFormState } from "@/lib/form-state";

import { createCount } from "../actions";

const SCOPES: CountScope[] = ["full", "category", "spot", "opening"];

export function NewCountForm({
  categories,
  defaultAsOf,
}: {
  categories: { id: string; path: string }[];
  /** London "YYYY-MM-DDTHH:mm". */
  defaultAsOf: string;
}) {
  const [state, formAction] = useActionState(createCount, initialFormState);
  const [scope, setScope] = useState<CountScope>(
    (state.values?.scope as CountScope | undefined) ?? "full",
  );
  const [name, setName] = useState(state.values?.name ?? "Full count");
  const [nameTouched, setNameTouched] = useState(Boolean(state.values?.name));

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field>
          <FieldLabel>What are you counting?</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPES.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted/50"
              >
                <input
                  type="radio"
                  name="scope"
                  value={option}
                  checked={scope === option}
                  onChange={() => {
                    setScope(option);
                    if (!nameTouched) setName(COUNT_SCOPE_LABELS[option]);
                  }}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {COUNT_SCOPE_LABELS[option]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {COUNT_SCOPE_DESCRIPTIONS[option]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        {scope === "category" && (
          <Field data-invalid={Boolean(state.fieldErrors.category_id)}>
            <FieldLabel htmlFor="category_id">Category</FieldLabel>
            <NativeSelect
              id="category_id"
              name="category_id"
              defaultValue={state.values?.category_id ?? ""}
            >
              <NativeSelectOption value="">
                Choose a category…
              </NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.path}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldErrors state={state} name="category_id" />
          </Field>
        )}

        <Field data-invalid={Boolean(state.fieldErrors.name)}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            maxLength={100}
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameTouched(true);
            }}
          />
          <FieldErrors state={state} name="name" />
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.as_of)}>
          <FieldLabel htmlFor="as_of">When is the count?</FieldLabel>
          <Input
            id="as_of"
            name="as_of"
            type="datetime-local"
            required
            className="max-w-60"
            defaultValue={state.values?.as_of ?? defaultAsOf}
          />
          <FieldDescription>
            UK time, outside trading hours, for example 22:30 after closing. The
            count is checked against the stock the system expected at this
            moment, so every sale up to then must be imported before it can be
            approved.
          </FieldDescription>
          <FieldErrors state={state} name="as_of" />
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.notes)}>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={state.values?.notes}
          />
          <FieldErrors state={state} name="notes" />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <SubmitButton pendingText="Starting…">Start the count</SubmitButton>
        <Button variant="outline" render={<Link href="/counts" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
