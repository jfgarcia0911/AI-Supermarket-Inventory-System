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
import { formValues, requiredText } from "@/lib/validation";

export async function updateMyName(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser())) {
    return formFailure("Please sign in again.", formData);
  }
  const parsed = z
    .object({ full_name: requiredText("Your name", 100) })
    .safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_name", {
    p_full_name: parsed.data.full_name,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/", "layout");
  return formSuccess("Name saved.");
}
