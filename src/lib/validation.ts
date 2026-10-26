// Building blocks for checking form input on the server with Zod.
// Form fields arrive as strings; blank means "no value".

import { z } from "zod";

const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "")
    ? null
    : value;

const stripMoney = (value: unknown) =>
  typeof value === "string" ? value.replace(/[£,\s]/g, "") : value;

export function requiredText(label: string, max: number) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

export function optionalText(label: string, max: number) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(max, `${label} must be ${max} characters or fewer.`)
      .nullable(),
  );
}

interface NumberRules {
  min?: number;
  max?: number;
  positive?: boolean;
  integer?: boolean;
}

function numberSchema(label: string, rules: NumberRules) {
  let schema = z.coerce.number({ error: `${label} must be a number.` });
  if (rules.integer) {
    schema = schema.int(`${label} must be a whole number.`);
  }
  if (rules.positive) {
    schema = schema.positive(`${label} must be more than zero.`);
  } else if (rules.min !== undefined) {
    schema = schema.min(
      rules.min,
      `${label} cannot be less than ${rules.min}.`,
    );
  }
  if (rules.max !== undefined) {
    schema = schema.max(
      rules.max,
      `${label} cannot be more than ${rules.max}.`,
    );
  }
  return schema;
}

export function optionalNumber(label: string, rules: NumberRules = {}) {
  return z.preprocess(
    (value) => blankToNull(stripMoney(value)),
    numberSchema(label, rules).nullable(),
  );
}

export function requiredNumber(label: string, rules: NumberRules = {}) {
  return z
    .preprocess(
      (value) => blankToNull(stripMoney(value)),
      numberSchema(label, rules)
        .nullable()
        .refine((value) => value !== null, {
          error: `${label} is required.`,
        }),
    )
    .transform((value) => value as number);
}

export function requiredId(label: string) {
  return z.uuid({ error: `Choose ${label}.` });
}

/** Checkboxes send a value (usually "on") when ticked and nothing when not. */
export const checkbox = z.preprocess(
  (value) =>
    typeof value === "string" &&
    value !== "" &&
    value !== "false" &&
    value !== "off",
  z.boolean(),
);

export function formValues(
  formData: FormData,
): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData);
}
