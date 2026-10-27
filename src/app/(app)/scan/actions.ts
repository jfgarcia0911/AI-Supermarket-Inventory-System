"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionUser } from "@/lib/auth";
import { isValidGtin } from "@/lib/barcodes";
import { friendlyDbError } from "@/lib/db-errors";
import { type FormState, formFailure, formSuccess } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

export interface ProductCard {
  id: string;
  name: string;
  brand: string | null;
  size: string | null;
  soldBy: "each" | "kg";
  category: string | null;
  barcodes: string[];
  tillCode: string | null;
  onHand: number | null;
  reorderPoint: number | null;
  lastCountedAt: string | null;
  lastMovementAt: string | null;
  /** Counts in progress that this product can be counted in. */
  openCounts: { id: string; name: string }[];
}

/** Everything the Scan page shows about one product. */
export async function productCard(
  productId: string,
): Promise<ProductCard | null> {
  if (!(await actionUser()) || !z.uuid().safeParse(productId).success) {
    return null;
  }
  const supabase = await createClient();
  const [
    { data: product },
    { data: barcodes },
    { data: level },
    { data: counts },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, brand, size, sold_by, till_code, reorder_point, category_id",
      )
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("product_barcodes")
      .select("barcode")
      .eq("product_id", productId)
      .eq("active", true)
      .order("is_primary", { ascending: false }),
    supabase
      .from("stock_levels")
      .select("quantity_on_hand, last_counted_at, last_movement_at")
      .eq("product_id", productId)
      .maybeSingle(),
    supabase
      .from("stock_counts")
      .select("id, name, scope")
      .eq("status", "in_progress")
      .neq("scope", "opening")
      .order("as_of", { ascending: false }),
  ]);
  if (!product) {
    return null;
  }
  const { data: category } = await supabase
    .from("category_paths")
    .select("path")
    .eq("id", product.category_id)
    .maybeSingle();
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    size: product.size,
    soldBy: product.sold_by,
    category: category?.path ?? null,
    barcodes: (barcodes ?? []).map((b) => b.barcode),
    tillCode: product.till_code,
    onHand: level?.quantity_on_hand ?? null,
    reorderPoint: product.reorder_point,
    lastCountedAt: level?.last_counted_at ?? null,
    lastMovementAt: level?.last_movement_at ?? null,
    openCounts: (counts ?? []).map((c) => ({ id: c.id, name: c.name })),
  };
}

/** Staff: tell the managers someone scanned a barcode no product has. */
export async function reportUnknownBarcode(code: string): Promise<FormState> {
  if (!(await actionUser("owner", "manager", "staff"))) {
    return formFailure("You do not have permission to report barcodes.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_unknown_barcode", {
    p_code: code,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath("/alerts");
  return formSuccess("Thanks. A manager will see it in Alerts.");
}

/** Managers: the scanned barcode belongs to an existing product. */
export async function addScannedBarcode(
  productId: string,
  code: string,
): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure("Only owners and managers can add barcodes.");
  }
  if (!isValidGtin(code)) {
    return formFailure(`${code} is not a valid barcode.`);
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from("product_barcodes")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("active", true)
    .eq("is_primary", true);
  const { error } = await supabase.from("product_barcodes").insert({
    product_id: productId,
    barcode: code,
    is_primary: count === 0,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/alerts");
  return formSuccess(`${code} added. Scanning it now finds this product.`);
}
