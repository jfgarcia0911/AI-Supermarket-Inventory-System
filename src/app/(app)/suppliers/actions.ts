"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { formatMoney, formatPercent } from "@/lib/format";
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
  optionalText,
  requiredNumber,
  requiredText,
} from "@/lib/validation";

const NOT_ALLOWED = "Only owners and managers can change suppliers.";

const supplierSchema = z.object({
  name: requiredText("The name", 120),
  account_number: optionalText("The account number", 40),
  contact_name: optionalText("The contact name", 100),
  phone: optionalText("The phone number", 40),
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    z.email("That email address does not look right.").nullable(),
  ),
  payment_terms_days: optionalNumber("Payment terms", {
    min: 0,
    max: 365,
    integer: true,
  }),
  delivery_days: optionalText("Delivery days", 60),
  lead_time_days: optionalNumber("Lead time", {
    min: 0,
    max: 60,
    integer: true,
  }).transform((value) => value ?? 1),
  notes: optionalText("Notes", 2000),
});

export async function createSupplier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = supplierSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/suppliers");
  redirect(`/suppliers/${data.id}`);
}

export async function updateSupplier(
  supplierId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = supplierSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update(parsed.data)
    .eq("id", supplierId);
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/suppliers", "layout");
  redirect(`/suppliers/${supplierId}`);
}

export async function setSupplierActive(
  supplierId: string,
  active: boolean,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ active })
    .eq("id", supplierId);
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath("/suppliers", "layout");
  return formSuccess(
    active ? "Supplier switched back on." : "Supplier switched off.",
  );
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Finds an active product by any of its barcodes, or by its till code. */
async function findProduct(supabase: Client, code: string) {
  const digits = code.replace(/[\s-]/g, "");
  if (/^\d{8,14}$/.test(digits)) {
    const { data } = await supabase
      .from("product_barcodes")
      .select("product:products(id, name, active)")
      .eq("barcode", digits)
      .eq("active", true)
      .maybeSingle();
    if (data?.product?.active) {
      return data.product;
    }
  }
  const { data } = await supabase
    .from("products")
    .select("id, name, active")
    .eq("till_code", code.trim().toUpperCase())
    .eq("active", true)
    .maybeSingle();
  return data;
}

const supplierProductSchema = z.object({
  product_code: requiredText("Our product's barcode or till code", 20),
  supplier_code: optionalText("Their code", 40),
  supplier_description: optionalText("Their description", 200),
  units_per_case: requiredNumber("Units per case", {
    positive: true,
    max: 100_000,
  }),
  is_preferred: checkbox,
  case_cost: optionalNumber("The case cost", { min: 0, max: 1_000_000 }),
});

export async function saveSupplierProduct(
  supplierId: string,
  linkId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = supplierProductSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const values = parsed.data;

  const supabase = await createClient();
  const product = await findProduct(supabase, values.product_code);
  if (!product) {
    return formFailure("Please check the highlighted fields.", formData, {
      product_code: ["No active product has that barcode or till code."],
    });
  }

  const { data: savedId, error } = await supabase.rpc("save_supplier_product", {
    p_id: linkId ?? undefined,
    p_supplier_id: supplierId,
    p_product_id: product.id,
    p_supplier_code: values.supplier_code ?? "",
    p_description: values.supplier_description ?? "",
    p_units_per_case: values.units_per_case,
    p_preferred: values.is_preferred,
  });
  if (error || !savedId) {
    return formFailure(friendlyDbError(error), formData);
  }

  if (values.case_cost !== null) {
    const { error: costError } = await supabase.rpc("record_supplier_cost", {
      p_supplier_product_id: savedId,
      p_case_cost: values.case_cost,
    });
    if (costError) {
      return formFailure(
        `Saved, but the cost was not recorded: ${friendlyDbError(costError)}`,
        formData,
      );
    }
  }

  revalidatePath(`/suppliers/${supplierId}`, "layout");
  revalidatePath(`/products/${product.id}`);
  if (linkId) {
    redirect(`/suppliers/${supplierId}`);
  }
  return formSuccess(`Added ${product.name}.`);
}

export async function recordSupplierCost(
  linkId: string,
  supplierId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure("Only owners and managers can record costs.", formData);
  }
  const parsed = z
    .object({
      case_cost: requiredNumber("The case cost", { min: 0, max: 1_000_000 }),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_supplier_cost", {
    p_supplier_product_id: linkId,
    p_case_cost: parsed.data.case_cost,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath(`/suppliers/${supplierId}`, "layout");
  if (!data?.id) {
    return formSuccess(
      "That is the same as the latest cost, so nothing changed.",
    );
  }
  const change =
    data.change_pct != null
      ? ` (${formatPercent(data.change_pct)} per item)`
      : "";
  return formSuccess(
    `New case cost of ${formatMoney(data.case_cost)} recorded${change}.`,
  );
}

export async function removeSupplierProduct(
  linkId: string,
  supplierId: string,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_products")
    .update({ active: false, is_preferred: false })
    .eq("id", linkId)
    .eq("supplier_id", supplierId);
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath(`/suppliers/${supplierId}`, "layout");
  return formSuccess("Removed from this supplier's products.");
}
