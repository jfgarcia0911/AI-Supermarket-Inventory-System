"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionUser } from "@/lib/auth";
import { isValidGtin } from "@/lib/barcodes";
import { friendlyDbError } from "@/lib/db-errors";
import {
  type FormState,
  formFailure,
  formInvalid,
  formSuccess,
} from "@/lib/form-state";
import type { ImportSummary } from "@/lib/imports/schemas";
import { londonLocalToDate } from "@/lib/london-time";
import { createClient } from "@/lib/supabase/server";
import {
  formValues,
  optionalNumber,
  optionalText,
  requiredId,
  requiredNumber,
  requiredText,
} from "@/lib/validation";

const NOT_ALLOWED = "Only owners and managers can change products.";

const tillCode = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim().toUpperCase() || null : null,
  z
    .string()
    .regex(
      /^[A-Z0-9-]{1,20}$/,
      "Till codes may only use letters, numbers and dashes (up to 20).",
    )
    .nullable(),
);

const barcode = z.preprocess(
  (value) =>
    typeof value === "string" ? value.replace(/[\s-]/g, "") || null : null,
  z
    .string()
    .refine(isValidGtin, "That is not a valid barcode. Check the digits.")
    .nullable(),
);

const productSchema = z.object({
  name: requiredText("The name", 120),
  brand: optionalText("The brand", 80),
  size: optionalText("The size", 40),
  category_id: requiredId("a category"),
  sold_by: z.enum(["each", "kg"], { error: "Choose how it is sold." }),
  vat_code: z.string().regex(/^[A-Z]$/, "Choose a VAT rate."),
  sell_price: optionalNumber("The selling price", { min: 0, max: 100_000 }),
  reorder_point: optionalNumber("The reorder point", {
    min: 0,
    max: 1_000_000,
  }),
  reorder_qty: optionalNumber("The reorder quantity", {
    positive: true,
    max: 1_000_000,
  }),
  till_code: tillCode,
});

export async function createProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = productSchema
    .extend({ barcode })
    .safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const p = parsed.data;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_product", {
    p_name: p.name,
    p_category_id: p.category_id,
    p_vat_code: p.vat_code,
    p_brand: p.brand ?? undefined,
    p_size: p.size ?? undefined,
    p_sold_by: p.sold_by,
    p_sell_price: p.sell_price ?? undefined,
    p_reorder_point: p.reorder_point ?? undefined,
    p_reorder_qty: p.reorder_qty ?? undefined,
    p_till_code: p.till_code ?? undefined,
    p_barcode: p.barcode ?? undefined,
  });
  if (error || !id) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/products", "layout");
  redirect(`/products/${id}`);
}

export async function updateProduct(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = productSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", productId);
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/products", "layout");
  redirect(`/products/${productId}`);
}

export async function setProductActive(
  productId: string,
  active: boolean,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ active })
    .eq("id", productId);
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath("/products", "layout");
  return formSuccess(
    active ? "Product switched back on." : "Product switched off.",
  );
}

const barcodeSchema = z
  .object({
    barcode: barcode.refine((value) => value !== null, "Enter a barcode."),
    pack_type: z.enum(["unit", "case", "outer"]),
    units_per_pack: optionalNumber("Units in the pack", {
      positive: true,
      max: 100_000,
    }),
  })
  .refine(
    (value) => value.pack_type === "unit" || value.units_per_pack !== null,
    {
      path: ["units_per_pack"],
      error: "Enter how many single items are in the case.",
    },
  );

export async function addBarcode(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = barcodeSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const { pack_type } = parsed.data;

  const supabase = await createClient();
  const { count } = await supabase
    .from("product_barcodes")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("active", true)
    .eq("is_primary", true);

  const { error } = await supabase.from("product_barcodes").insert({
    product_id: productId,
    barcode: parsed.data.barcode as string,
    pack_type,
    units_per_pack:
      pack_type === "unit" ? 1 : (parsed.data.units_per_pack as number),
    is_primary: pack_type === "unit" && count === 0,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath(`/products/${productId}`);
  return formSuccess("Barcode added.");
}

export async function setPrimaryBarcode(
  barcodeId: string,
  productId: string,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_primary_barcode", {
    p_barcode_id: barcodeId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath(`/products/${productId}`);
  return formSuccess("Main barcode changed.");
}

export async function removeBarcode(
  barcodeId: string,
  productId: string,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_barcodes")
    .update({ active: false, is_primary: false })
    .eq("id", barcodeId)
    .eq("product_id", productId);
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath(`/products/${productId}`);
  return formSuccess("Barcode removed.");
}

const openingStockSchema = z.object({
  quantity: requiredNumber("The quantity counted", { min: 0, max: 1_000_000 }),
  counted_at: z.string().transform((value, ctx) => {
    const date = londonLocalToDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Enter when it was counted." });
      return z.NEVER;
    }
    return date.toISOString();
  }),
});

/** Opening stock for one product, entered by hand on its page. */
export async function setOpeningStock(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(
      "Only owners and managers can set opening stock.",
      formData,
    );
  }
  const parsed = openingStockSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const request = {
    p_rows: [
      {
        row_number: 1,
        product_id: productId,
        quantity: parsed.data.quantity,
        unit_cost: null,
      },
    ],
    p_as_of: parsed.data.counted_at,
  };

  // Check first, so a problem comes back as a clear message.
  const supabase = await createClient();
  const { data: preview, error: previewError } = await supabase.rpc(
    "import_opening_stock",
    {
      ...request,
      p_dry_run: true,
    },
  );
  if (previewError) {
    return formFailure(friendlyDbError(previewError), formData);
  }
  const problem = (preview as unknown as ImportSummary | null)?.errors[0];
  if (problem) {
    return formFailure(problem.message, formData);
  }

  const { error } = await supabase.rpc("import_opening_stock", {
    ...request,
    p_dry_run: false,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/stock", "layout");
  return formSuccess("Opening stock saved.");
}
