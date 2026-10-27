"use client";

import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
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

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function StoreForm({
  action,
  store,
}: {
  action: Action;
  store: { name: string; address: string | null; trading_day_end: string };
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.name)}>
          <FieldLabel htmlFor="name">Shop name</FieldLabel>
          <Input
            id="name"
            name="name"
            required
            maxLength={100}
            defaultValue={state.values?.name ?? store.name}
          />
          <FieldErrors state={state} name="name" />
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors.address)}>
          <FieldLabel htmlFor="address">Address</FieldLabel>
          <Input
            id="address"
            name="address"
            maxLength={300}
            defaultValue={state.values?.address ?? store.address ?? ""}
          />
          <FieldErrors state={state} name="address" />
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors.trading_day_end)}>
          <FieldLabel htmlFor="trading_day_end">
            End of the trading day
          </FieldLabel>
          <Input
            id="trading_day_end"
            name="trading_day_end"
            type="time"
            required
            className="max-w-36"
            defaultValue={
              state.values?.trading_day_end ?? store.trading_day_end.slice(0, 5)
            }
          />
          <FieldDescription>
            Each day&apos;s till sales are counted as happening at this time.
          </FieldDescription>
          <FieldErrors state={state} name="trading_day_end" />
        </Field>
      </FieldGroup>
      <SubmitButton pendingText="Saving…">Save shop details</SubmitButton>
    </form>
  );
}

export function ThresholdsForm({
  action,
  settings,
}: {
  action: Action;
  settings: {
    key: string;
    value: number;
    label: string;
    description: string;
  }[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <FormMessage state={state} />
      <FieldGroup>
        {settings.map((setting) => (
          <Field
            key={setting.key}
            data-invalid={Boolean(state.fieldErrors[setting.key])}
          >
            <FieldLabel htmlFor={setting.key}>{setting.label}</FieldLabel>
            <Input
              id={setting.key}
              name={setting.key}
              inputMode="decimal"
              required
              className="max-w-36"
              defaultValue={
                state.values?.[setting.key] ?? String(setting.value)
              }
            />
            <FieldDescription>{setting.description}</FieldDescription>
            <FieldErrors state={state} name={setting.key} />
          </Field>
        ))}
      </FieldGroup>
      <SubmitButton pendingText="Saving…">Save limits</SubmitButton>
    </form>
  );
}

export function ReasonForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field
          className="min-w-48 flex-1"
          data-invalid={Boolean(state.fieldErrors.name)}
        >
          <FieldLabel htmlFor="reason-name">New reason</FieldLabel>
          <Input
            id="reason-name"
            name="name"
            maxLength={60}
            required
            defaultValue={state.values?.name}
          />
        </Field>
        <Field className="w-48">
          <FieldLabel htmlFor="reason-direction">Moves stock</FieldLabel>
          <NativeSelect
            id="reason-direction"
            name="direction"
            defaultValue={state.values?.direction ?? "decrease"}
          >
            <NativeSelectOption value="decrease">
              Out (waste, loss)
            </NativeSelectOption>
            <NativeSelectOption value="increase">
              In (found stock)
            </NativeSelectOption>
            <NativeSelectOption value="either">Either way</NativeSelectOption>
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="note_required"
            value="on"
            className="accent-primary"
          />
          Needs a note
        </label>
        <SubmitButton variant="outline" pendingText="Adding…">
          Add reason
        </SubmitButton>
      </div>
      <FieldErrors state={state} name="name" />
    </form>
  );
}
