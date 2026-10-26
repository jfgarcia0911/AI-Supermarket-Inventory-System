"use client";

import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/form-state";

/** A submit button that shows a spinner while its form is being saved. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending && <Spinner />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** The overall success or error message from a form's last submit. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) {
    return null;
  }
  return (
    <Alert variant={state.ok ? "default" : "destructive"}>
      {state.ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/** Errors for one field, from the form's last submit. */
export function FieldErrors({
  state,
  name,
}: {
  state: FormState;
  name: string;
}) {
  const messages = state.fieldErrors[name];
  if (!messages?.length) {
    return null;
  }
  return <FieldError errors={messages.map((message) => ({ message }))} />;
}
