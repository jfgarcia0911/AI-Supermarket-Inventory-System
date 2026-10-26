"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import {
  type FormState,
  formFailure,
  formInvalid,
  formSuccess,
} from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import {
  formValues,
  optionalText,
  requiredNumber,
  requiredText,
} from "@/lib/validation";

import { THRESHOLD_KEYS, type ThresholdKey } from "./thresholds";

const NOT_OWNER = "Only owners can change settings.";

const storeSchema = z.object({
  name: requiredText("The shop name", 100),
  address: optionalText("The address", 300),
  trading_day_end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time such as 22:00."),
});

export async function updateStore(
  storeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure(NOT_OWNER, formData);
  }
  const parsed = storeSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update(parsed.data)
    .eq("id", storeId);
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/settings");
  return formSuccess("Shop details saved.");
}

const thresholdsSchema = z.object(
  Object.fromEntries(
    THRESHOLD_KEYS.map((key) => [
      key,
      requiredNumber("This limit", { min: 0, max: 100_000 }),
    ]),
  ) as Record<ThresholdKey, ReturnType<typeof requiredNumber>>,
);

export async function updateThresholds(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure(NOT_OWNER, formData);
  }
  const parsed = thresholdsSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const results = await Promise.all(
    THRESHOLD_KEYS.map((key) =>
      supabase
        .from("settings")
        .update({ value: parsed.data[key] })
        .eq("key", key),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return formFailure(friendlyDbError(failed.error), formData);
  }
  revalidatePath("/settings");
  return formSuccess("Limits saved.");
}
