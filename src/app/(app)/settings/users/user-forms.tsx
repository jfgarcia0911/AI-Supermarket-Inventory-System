"use client";

import { useActionState, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { TemporaryPassword } from "@/components/temporary-password";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { type FormState, initialFormState } from "@/lib/form-state";
import {
  type AppRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
} from "@/lib/roles";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function AddUserForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [role, setRole] = useState<AppRole>("staff");

  return (
    <div className="space-y-4">
      {state.ok && state.data?.password ? (
        <TemporaryPassword
          email={state.data.email}
          password={state.data.password}
        />
      ) : (
        <FormMessage state={state} />
      )}
      <form action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field data-invalid={Boolean(state.fieldErrors.full_name)}>
            <FieldLabel htmlFor="full_name">Name</FieldLabel>
            <Input
              id="full_name"
              name="full_name"
              required
              maxLength={100}
              defaultValue={state.values?.full_name}
            />
            <FieldErrors state={state} name="full_name" />
          </Field>
          <Field data-invalid={Boolean(state.fieldErrors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={state.values?.email}
            />
            <FieldErrors state={state} name="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <NativeSelect
              id="role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
            >
              {ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {ROLE_LABELS[r]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">
          {ROLE_DESCRIPTIONS[role]}
        </p>
        <SubmitButton pendingText="Creating…">Create account</SubmitButton>
      </form>
    </div>
  );
}

export function RoleForm({ action, role }: { action: Action; role: AppRole }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <NativeSelect name="role" defaultValue={role} aria-label="Role" size="sm">
        {ROLES.map((r) => (
          <NativeSelectOption key={r} value={r}>
            {ROLE_LABELS[r]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="outline">
        Save
      </SubmitButton>
      {state.message && (
        <span
          className={
            state.ok
              ? "text-xs text-muted-foreground"
              : "text-xs text-destructive"
          }
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function ResetPasswordButton({
  action,
  name,
}: {
  action: () => Promise<FormState>;
  name: string;
}) {
  const [result, setResult] = useState<FormState | null>(null);
  return (
    <div className="space-y-2">
      <ActionButton
        variant="outline"
        size="sm"
        action={action}
        onResult={setResult}
        confirm={{
          title: `Reset ${name}'s password?`,
          description:
            "Their current password stops working. You will get a temporary one to give them, and they choose their own when they next sign in.",
          confirmLabel: "Reset password",
        }}
      >
        Reset password
      </ActionButton>
      {result?.ok && result.data?.password && (
        <TemporaryPassword
          email={result.data.email}
          password={result.data.password}
        />
      )}
    </div>
  );
}
