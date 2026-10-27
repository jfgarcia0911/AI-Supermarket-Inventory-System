"use server";

import { revalidatePath } from "next/cache";
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
import { createClient } from "@/lib/supabase/server";
import { formValues, optionalText, requiredNumber } from "@/lib/validation";

const adjustmentSchema = z.object({
  product_id: z.uuid({ error: "Find the product first." }),
  reason_id: z.uuid({ error: "Choose a reason." }),
  quantity: requiredNumber("The quantity", { positive: true, max: 100_000 }),
  direction: z.enum(["out", "in"]).optional(),
  note: optionalText("The note", 500),
});

function refresh() {
  revalidatePath("/adjustments");
  revalidatePath("/stock", "layout");
  revalidatePath("/products", "layout");
}

export async function requestAdjustment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager", "staff"))) {
    return formFailure("You do not have permission to adjust stock.", formData);
  }
  const parsed = adjustmentSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const values = parsed.data;

  const supabase = await createClient();
  const [{ data: reason }, { data: product }] = await Promise.all([
    supabase
      .from("adjustment_reasons")
      .select("name, direction")
      .eq("id", values.reason_id)
      .maybeSingle(),
    supabase
      .from("products")
      .select("name, sold_by")
      .eq("id", values.product_id)
      .maybeSingle(),
  ]);
  if (!reason || !product) {
    return formFailure("That product or reason no longer exists.", formData);
  }
  // The reason decides the direction; "either" reasons say which way.
  const out =
    reason.direction === "decrease" ||
    (reason.direction === "either" && values.direction !== "in");
  const quantity = out ? -values.quantity : values.quantity;

  const { data, error } = await supabase.rpc("request_adjustment", {
    p_product_id: values.product_id,
    p_quantity: quantity,
    p_reason_id: values.reason_id,
    p_note: values.note ?? undefined,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  refresh();
  const amount = formatQuantity(values.quantity, product.sold_by);
  if ((data as { status?: string } | null)?.status === "pending") {
    return formSuccess(
      `${amount} × ${product.name} is over the limit, so a manager needs to approve it. Stock has not changed yet.`,
    );
  }
  return formSuccess(
    `Recorded: ${amount} × ${product.name} ${out ? "taken out of" : "added to"} stock (${reason.name.toLowerCase()}).`,
  );
}

export async function decideAdjustment(
  adjustmentId: string,
  approve: boolean,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure("Only owners and managers can approve adjustments.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_adjustment", {
    p_adjustment_id: adjustmentId,
    p_approve: approve,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh();
  return formSuccess(
    approve
      ? "Approved. Stock has been updated."
      : "Rejected. Stock has not changed.",
  );
}
