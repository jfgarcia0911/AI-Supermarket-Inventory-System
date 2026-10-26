"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  checkbox,
  formValues,
  optionalNumber,
  requiredText,
} from "@/lib/validation";

const NOT_ALLOWED = "Only owners and managers can change categories.";

const categorySchema = z.object({
  name: requiredText("The name", 80).refine((name) => !name.includes(">"), {
    error: 'Category names cannot contain ">".',
  }),
  parent_id: z.preprocess(
    (value) => (value ? value : null),
    z.uuid().nullable(),
  ),
  target_margin_pct: optionalNumber("The target margin", {
    min: 0,
    max: 99.99,
  }),
  expiry_warning_days: optionalNumber("The expiry warning", {
    min: 0,
    max: 365,
    integer: true,
  }),
});

export async function createCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = categorySchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert(parsed.data);
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/categories");
  return formSuccess(`Category "${parsed.data.name}" added.`);
}

export async function updateCategory(
  categoryId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = categorySchema
    .extend({ active: checkbox })
    .safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  if (!parsed.data.active) {
    const [{ data: category }, { count: children }] = await Promise.all([
      supabase
        .from("category_overview")
        .select("product_count")
        .eq("id", categoryId)
        .maybeSingle(),
      supabase
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", categoryId)
        .eq("active", true),
    ]);
    if ((category?.product_count ?? 0) > 0) {
      return formFailure(
        `This category still has ${category?.product_count} active products. Move them or switch them off first.`,
        formData,
      );
    }
    if ((children ?? 0) > 0) {
      return formFailure(
        "Switch off the categories inside this one first.",
        formData,
      );
    }
  }

  const { error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", categoryId);
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/categories");
  revalidatePath("/products", "layout");
  redirect("/categories");
}
