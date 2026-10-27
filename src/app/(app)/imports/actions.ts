"use server";

import { revalidatePath } from "next/cache";

import { actionUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import {
  type ImportRequest,
  importRequestSchema,
  type ImportResult,
  type ImportSummary,
} from "@/lib/imports/schemas";
import { createClient } from "@/lib/supabase/server";

async function runImport(
  request: ImportRequest,
  dryRun: boolean,
): Promise<ImportResult> {
  if (!(await actionUser("owner", "manager"))) {
    return { ok: false, message: "Only owners and managers can import." };
  }
  const parsed = importRequestSchema.safeParse(request);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        "The file's rows could not be checked. Reload the page and try again.",
    };
  }
  const r = parsed.data;
  const common = {
    p_rows: r.rows,
    p_file_name: r.fileName,
    p_fingerprint: r.fingerprint,
    p_mapping: r.mapping,
    p_rows_skipped: r.rowsSkipped,
    p_dry_run: dryRun,
  };

  const supabase = await createClient();
  const { data, error } =
    r.kind === "products"
      ? await supabase.rpc("import_products", common)
      : r.kind === "sales"
        ? await supabase.rpc("import_sales", {
            ...common,
            p_column_headers: r.columnHeaders,
          })
        : r.kind === "opening_stock"
          ? await supabase.rpc("import_opening_stock", {
              ...common,
              p_as_of: r.asOf,
            })
          : await supabase.rpc("import_supplier_products", {
              ...common,
              p_supplier_id: r.supplierId,
            });
  if (error || !data) {
    return { ok: false, message: friendlyDbError(error) };
  }

  if (!dryRun) {
    revalidatePath("/", "layout");
  }
  return { ok: true, summary: data as unknown as ImportSummary };
}

/** Works out what the import would do, without saving anything. */
export async function previewImport(
  request: ImportRequest,
): Promise<ImportResult> {
  return runImport(request, true);
}

/** Runs the import for real: all rows or none. */
export async function commitImport(
  request: ImportRequest,
): Promise<ImportResult> {
  return runImport(request, false);
}
