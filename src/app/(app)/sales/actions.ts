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
import { formValues, requiredText } from "@/lib/validation";

const NOT_ALLOWED = "Only owners and managers can do this.";

function refresh() {
  revalidatePath("/sales", "layout");
  revalidatePath("/stock", "layout");
  revalidatePath("/");
}

/** Links every unmatched line with this code to a product. */
export async function matchSalesCode(
  code: string,
  productId: string,
  remember: boolean,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  if (!z.uuid().safeParse(productId).success || !code.trim()) {
    return formFailure("Choose a product.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_sales_code", {
    p_code: code,
    p_product_id: productId,
    p_remember: remember,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh();
  const result = data as {
    matched: number;
    already_counted: number;
    units: number;
    remembered: "barcode" | "rule" | null;
  };
  const parts = [
    `${result.matched} ${result.matched === 1 ? "line" : "lines"} matched: ${formatQuantity(result.units)} taken off stock.`,
  ];
  if (result.already_counted > 0) {
    parts.push(
      `${result.already_counted} from before the product's stock count were left out.`,
    );
  }
  if (result.remembered === "barcode") {
    parts.push(`${code} is now one of the product's barcodes.`);
  } else if (result.remembered === "rule") {
    parts.push(`Future imports will match ${code} too.`);
  }
  return formSuccess(parts.join(" "));
}

/** Marks every unmatched line with this code as ignored (no stock change). */
export async function ignoreSalesCode(
  code: string,
  always: boolean,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ignore_sales_code", {
    p_code: code,
    p_always: always,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh();
  return formSuccess(
    `${data} ${data === 1 ? "line" : "lines"} ignored.${always ? ` Future imports will ignore ${code} too.` : ""}`,
  );
}

/** Stops matching or ignoring a code automatically. */
export async function forgetSalesCodeRule(code: string): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("forget_sales_code_rule", {
    p_code: code,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh();
  return formSuccess(
    `Future imports will list ${code} as unmatched again if it appears.`,
  );
}

const reverseSchema = z.object({
  reason: requiredText("The reason", 300),
});

/** Owners only: undoes every stock change an import made. */
export async function reverseSalesImport(
  importId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure("Only owners can reverse a sales import.", formData);
  }
  const parsed = reverseSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_sales_import", {
    p_import_id: importId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  refresh();
  revalidatePath("/imports");
  return formSuccess(
    `Reversed: ${data} stock changes undone. These days can be imported again.`,
  );
}
