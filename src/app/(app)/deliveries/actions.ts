"use server";

import { randomUUID } from "node:crypto";

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
import {
  formValues,
  optionalNumber,
  optionalText,
  requiredNumber,
  requiredText,
} from "@/lib/validation";

const STAFF_ROLES = ["owner", "manager", "staff"] as const;
const COST_ROLES = ["owner", "manager"] as const;
const NOT_ALLOWED = "You do not have permission to do that.";

// Keep in step with the delivery-files storage bucket and the upload form.
const DELIVERY_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function refresh(invoiceId: string) {
  revalidatePath(`/deliveries/${invoiceId}`);
  revalidatePath("/deliveries");
}

const londonDateTime = (label: string) =>
  z.string({ error: `Enter ${label}.` }).transform((value, ctx) => {
    const date = londonLocalToDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: `Enter ${label}.` });
      return z.NEVER;
    }
    return date.toISOString();
  });

const newDeliverySchema = z.object({
  supplier_id: z.uuid({ error: "Choose the supplier." }),
  delivered_at: londonDateTime("when it arrived"),
  document_type: z.enum(["invoice", "credit_note"]),
  notes: optionalText("Notes", 1000),
});

export async function createDelivery(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser(...STAFF_ROLES))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = newDeliverySchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_delivery", {
    p_supplier_id: parsed.data.supplier_id,
    p_delivered_at: parsed.data.delivered_at,
    p_document_type: parsed.data.document_type,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error || !id) {
    return formFailure(friendlyDbError(error), formData);
  }
  revalidatePath("/deliveries");
  redirect(`/deliveries/${id}`);
}

export async function addDeliveryLine(
  invoiceId: string,
  productId: string,
  cases: number,
  unitsPerCase: number | null,
): Promise<FormState> {
  if (!(await actionUser(...STAFF_ROLES))) {
    return formFailure(NOT_ALLOWED);
  }
  const parsed = z
    .object({
      productId: z.uuid(),
      cases: z.number().positive().max(100_000),
      unitsPerCase: z.number().positive().max(100_000).nullable(),
    })
    .safeParse({ productId, cases, unitsPerCase });
  if (!parsed.success) {
    return formFailure("Enter how many cases, more than zero.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_delivery_line", {
    p_invoice_id: invoiceId,
    p_product_id: parsed.data.productId,
    p_cases: parsed.data.cases,
    p_units_per_case: parsed.data.unitsPerCase ?? undefined,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(invoiceId);
  return formSuccess("Added.");
}

const lineSchema = z.object({
  cases_invoiced: requiredNumber("Cases on the paperwork", {
    min: 0,
    max: 100_000,
  }),
  cases_received: requiredNumber("Cases that arrived", {
    min: 0,
    max: 100_000,
  }),
  units_per_case: requiredNumber("Units in a case", {
    positive: true,
    max: 100_000,
  }),
  discrepancy: z.enum(["none", "short", "damaged", "substituted", "extra"]),
  note: optionalText("The note", 300),
});

export async function updateDeliveryLine(
  lineId: string,
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser(...STAFF_ROLES))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = lineSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const line = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_delivery_line", {
    p_line_id: lineId,
    p_cases_invoiced: line.cases_invoiced,
    p_cases_received: line.cases_received,
    p_units_per_case: line.units_per_case,
    p_discrepancy: line.discrepancy,
    p_note: line.note ?? undefined,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  refresh(invoiceId);
  return formSuccess("Saved.");
}

export async function removeDeliveryLine(
  lineId: string,
  invoiceId: string,
): Promise<FormState> {
  if (!(await actionUser(...STAFF_ROLES))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_delivery_line", {
    p_line_id: lineId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(invoiceId);
  return formSuccess("Line removed.");
}

export async function checkInDelivery(invoiceId: string): Promise<FormState> {
  if (!(await actionUser(...STAFF_ROLES))) {
    return formFailure(NOT_ALLOWED);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_in_delivery", {
    p_invoice_id: invoiceId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(invoiceId);
  return formSuccess("Checked in. A manager will enter the costs and post it.");
}

const chargeSchema = z.object({
  description: requiredText("The description", 200),
  net_amount: requiredNumber("The amount", { min: 0, max: 1_000_000 }),
  vat_rate_pct: requiredNumber("The VAT rate", { min: 0, max: 100 }),
});

export async function addDeliveryCharge(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser(...COST_ROLES))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = chargeSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_delivery_charge", {
    p_invoice_id: invoiceId,
    p_description: parsed.data.description,
    p_net_amount: parsed.data.net_amount,
    p_vat_rate_pct: parsed.data.vat_rate_pct,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  refresh(invoiceId);
  return formSuccess("Charge added.");
}

const money = (label: string) =>
  optionalNumber(label, { min: 0, max: 1_000_000 });

const costsSchema = z.object({
  invoice_number: optionalText("The invoice number", 40),
  invoice_date: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.iso.date({ error: "Enter the invoice date." }).nullable(),
  ),
  net_total: money("The total before VAT"),
  vat_total: money("The VAT"),
  gross_total: money("The total"),
});

/** Saves the invoice details and costs; with intent=post, also posts it. */
export async function saveDeliveryCosts(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser(...COST_ROLES))) {
    return formFailure(NOT_ALLOWED, formData);
  }
  const parsed = costsSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  // Line fields are named "case_cost:<line id>", "amount:<line id>" and "vat:<line id>".
  const lines = new Map<
    string,
    {
      case_cost?: number | null;
      net_amount?: number | null;
      vat_rate_pct?: number | null;
    }
  >();
  const lineNumber = optionalNumber("A line cost", { min: 0, max: 1_000_000 });
  for (const [key, value] of formData) {
    const match = /^(case_cost|amount|vat):([0-9a-f-]{36})$/.exec(key);
    if (!match) continue;
    const number = lineNumber.safeParse(value);
    if (!number.success) {
      return formFailure("Costs must be numbers, for example 4.20.", formData);
    }
    const line = lines.get(match[2]) ?? {};
    if (match[1] === "case_cost") line.case_cost = number.data;
    if (match[1] === "amount") line.net_amount = number.data;
    if (match[1] === "vat") line.vat_rate_pct = number.data;
    lines.set(match[2], line);
  }

  const h = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_delivery_costs", {
    p_invoice_id: invoiceId,
    p_invoice_number: h.invoice_number ?? "",
    p_invoice_date: h.invoice_date ?? undefined,
    p_net_total: h.net_total ?? undefined,
    p_vat_total: h.vat_total ?? undefined,
    p_gross_total: h.gross_total ?? undefined,
    p_lines: [...lines].map(([line_id, costs]) => ({ line_id, ...costs })),
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }

  if (formData.get("intent") !== "post") {
    refresh(invoiceId);
    return formSuccess("Saved. Nothing has been added to stock yet.");
  }

  const { data, error: postError } = await supabase.rpc("post_delivery", {
    p_invoice_id: invoiceId,
  });
  if (postError) {
    refresh(invoiceId);
    return formFailure(friendlyDbError(postError), formData);
  }
  refresh(invoiceId);
  revalidatePath("/stock", "layout");
  const units = Number((data as { units?: number } | null)?.units ?? 0);
  return formSuccess(
    `Posted. ${formatQuantity(units)} units and kg recorded in stock.`,
  );
}

export async function voidDelivery(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure("Only owners can void deliveries.", formData);
  }
  const parsed = z
    .object({ reason: requiredText("The reason", 300) })
    .safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_delivery", {
    p_invoice_id: invoiceId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return formFailure(friendlyDbError(error), formData);
  }
  refresh(invoiceId);
  revalidatePath("/stock", "layout");
  return formSuccess("Voided. Any stock it added has been taken back out.");
}

export async function uploadDeliveryFile(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser(...STAFF_ROLES))) {
    return formFailure(NOT_ALLOWED);
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return formFailure("Choose a photo or PDF of the paperwork.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return formFailure("The file is larger than 10 MB. Take a smaller photo.");
  }
  if (!DELIVERY_FILE_TYPES.includes(file.type)) {
    return formFailure("Use a photo (JPEG, PNG, HEIC) or a PDF.");
  }

  const safeName =
    file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";
  const path = `${invoiceId}/${randomUUID()}-${safeName}`;
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("delivery-files")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("Delivery file upload failed", uploadError);
    return formFailure("The file could not be uploaded. Please try again.");
  }
  const { error } = await supabase.rpc("add_delivery_file", {
    p_invoice_id: invoiceId,
    p_storage_path: path,
    p_file_name: file.name,
    p_content_type: file.type,
    p_size_bytes: file.size,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  refresh(invoiceId);
  return formSuccess("File added.");
}
