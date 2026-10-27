"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { formatQuantity } from "@/lib/format";
import {
  type FormState,
  formFailure,
  formInvalid,
  formSuccess,
} from "@/lib/form-state";
import { londonLocalToDate } from "@/lib/london-time";
import { createClient } from "@/lib/supabase/server";
import { formValues, optionalText, requiredText } from "@/lib/validation";

const COUNTERS = ["owner", "manager", "staff"] as const;
const MANAGERS = ["owner", "manager"] as const;

function refresh(countId?: string) {
  revalidatePath("/counts");
  if (countId) revalidatePath(`/counts/${countId}`);
}

const newCountSchema = z
  .object({
    name: requiredText("The name", 100),
    scope: z.enum(["full", "category", "spot", "opening"], {
      error: "Choose what to count.",
    }),
    // Only category counts have a category; the box is not shown otherwise.
    category_id: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.uuid().nullable(),
    ),
    as_of: z.string().refine((value) => londonLocalToDate(value) !== null, {
      message: "Enter the date and time of the count.",
    }),
    notes: optionalText("The notes", 1000),
  })
  .refine((v) => v.scope !== "category" || v.category_id, {
    message: "Choose the category to count.",
    path: ["category_id"],
  });

export async function createCount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser(...MANAGERS))) {
    return formFailure("Only owners and managers can start a count.", formData);
  }
  const parsed = newCountSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_count", {
    p_name: v.name,
    p_scope: v.scope,
    p_as_of: londonLocalToDate(v.as_of)!.toISOString(),
    p_category_id: v.category_id ?? undefined,
    p_notes: v.notes ?? undefined,
  });
  if (error || !data) {
    return formFailure(friendlyDbError(error), formData);
  }
  refresh();
  redirect(`/counts/${data}`);
}

const quantitySchema = z.number().min(0).max(1_000_000);

export async function addCountLine(
  countId: string,
  productId: string,
  quantity: number,
  location: string,
): Promise<FormState> {
  if (!(await actionUser(...COUNTERS))) {
    return formFailure("You do not have permission to count stock.");
  }
  if (!quantitySchema.safeParse(quantity).success) {
    return formFailure("Enter how many you counted (0 or more).");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_count_line", {
    p_count_id: countId,
    p_product_id: productId,
    p_counted_qty: quantity,
    p_location: location,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  return formSuccess(`Counted ${formatQuantity(quantity)} (${location}).`);
}

export async function updateCountLine(
  lineId: string,
  countId: string,
  quantity: number,
  location: string,
): Promise<FormState> {
  if (!(await actionUser(...COUNTERS))) {
    return formFailure("You do not have permission to count stock.");
  }
  if (!quantitySchema.safeParse(quantity).success) {
    return formFailure("Enter how many you counted (0 or more).");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_count_line", {
    p_line_id: lineId,
    p_counted_qty: quantity,
    p_location: location,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  return formSuccess("Saved.");
}

export async function removeCountLine(
  lineId: string,
  countId: string,
): Promise<FormState> {
  if (!(await actionUser(...COUNTERS))) {
    return formFailure("You do not have permission to count stock.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_count_line", {
    p_line_id: lineId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  return formSuccess("Line removed.");
}

export async function submitCount(countId: string): Promise<FormState> {
  if (!(await actionUser(...COUNTERS))) {
    return formFailure("You do not have permission to count stock.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_count", {
    p_count_id: countId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  revalidatePath("/");
  return formSuccess("Counting finished. A manager will review it.");
}

export async function requestRecounts(
  countId: string,
  productIds: string[],
): Promise<FormState> {
  if (!(await actionUser(...MANAGERS))) {
    return formFailure("Only owners and managers can ask for recounts.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_recounts", {
    p_count_id: countId,
    p_product_ids: productIds,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  return formSuccess(
    `${data} ${data === 1 ? "product is" : "products are"} to be counted again. The count is open for counting.`,
  );
}

export async function cancelCount(countId: string): Promise<FormState> {
  if (!(await actionUser(...MANAGERS))) {
    return formFailure("Only owners and managers can cancel a count.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_count", {
    p_count_id: countId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  return formSuccess("Count cancelled. Stock has not changed.");
}

export async function approveCount(
  countId: string,
  setUncountedToZero: boolean,
): Promise<FormState> {
  if (!(await actionUser(...MANAGERS))) {
    return formFailure("Only owners and managers can approve counts.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_count", {
    p_count_id: countId,
    p_uncounted_policy: setUncountedToZero ? "set_to_zero" : "leave_unchanged",
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(countId);
  revalidatePath("/stock", "layout");
  revalidatePath("/");
  const result = data as {
    products: number;
    corrections: number;
    units_added: number;
    units_removed: number;
  };
  return formSuccess(
    `Approved: ${result.products} products, ${result.corrections} corrected (${formatQuantity(result.units_added)} added, ${formatQuantity(result.units_removed)} taken off).`,
  );
}
