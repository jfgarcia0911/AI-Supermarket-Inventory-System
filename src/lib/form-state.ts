// The result a form's Server Action hands back to the page.

import type { z } from "zod";

export interface FormState {
  ok: boolean;
  message: string | null;
  fieldErrors: Record<string, string[] | undefined>;
  /** What the user typed, so a form with errors keeps it. */
  values?: Record<string, string>;
  /** Extra data for the page, such as a new temporary password. */
  data?: Record<string, string>;
}

export const initialFormState: FormState = {
  ok: false,
  message: null,
  fieldErrors: {},
};

/** The submitted text fields, leaving out passwords. */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (
      typeof value === "string" &&
      !/password/i.test(key) &&
      !key.startsWith("$")
    ) {
      values[key] = value;
    }
  }
  return values;
}

export function formSuccess(
  message: string,
  data?: Record<string, string>,
): FormState {
  return { ok: true, message, fieldErrors: {}, data };
}

export function formFailure(
  message: string,
  formData?: FormData,
  fieldErrors: FormState["fieldErrors"] = {},
): FormState {
  return {
    ok: false,
    message,
    fieldErrors,
    values: formData ? submittedValues(formData) : undefined,
  };
}

export function formInvalid(error: z.ZodError, formData: FormData): FormState {
  const fieldErrors: FormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return formFailure(
    "Please check the highlighted fields.",
    formData,
    fieldErrors,
  );
}
