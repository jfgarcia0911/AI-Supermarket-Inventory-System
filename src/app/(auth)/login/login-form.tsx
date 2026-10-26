"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form-state";

import { signIn } from "../actions";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState(signIn, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      {searchParams.get("reason") === "inactive" && (
        <Alert>
          <AlertDescription>
            Your account has been switched off. Ask the shop owner if you think
            this is a mistake.
          </AlertDescription>
        </Alert>
      )}
      {searchParams.get("error") === "link" && (
        <Alert variant="destructive">
          <AlertDescription>
            That link has expired or was already used. Request a new one.
          </AlertDescription>
        </Alert>
      )}
      <FormMessage state={state} />
      <input
        type="hidden"
        name="next"
        value={searchParams.get("next") ?? "/"}
      />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={state.values?.email}
            aria-invalid={Boolean(state.fieldErrors.email)}
          />
          <FieldErrors state={state} name="email" />
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors.password)}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors.password)}
          />
          <FieldErrors state={state} name="password" />
        </Field>
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
