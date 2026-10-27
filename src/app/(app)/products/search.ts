"use server";

import { actionUser } from "@/lib/auth";
import { isUuid, searchTerm } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export interface ProductMatch {
  id: string;
  name: string;
  brand: string | null;
  size: string | null;
  soldBy: "each" | "kg";
  /** How the search found it. */
  matchedBy:
    "supplier_code" | "barcode" | "case_barcode" | "till_code" | "name";
  /** Single items (or kg) in the case the code stands for, when known. */
  unitsPerCase: number | null;
  onHand: number | null;
}

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  size: string | null;
  sold_by: "each" | "kg";
  active: boolean;
}

const PRODUCT_FIELDS = "id, name, brand, size, sold_by, active";

/**
 * Finds active products for a search box: by the supplier's own code (when a
 * supplier is given), any barcode, the till code, or else by name or brand.
 */
export async function searchProducts(
  query: string,
  supplierId?: string | null,
): Promise<ProductMatch[]> {
  if (!(await actionUser())) {
    return [];
  }
  const term = searchTerm(String(query ?? "")).slice(0, 60);
  if (!term) {
    return [];
  }

  const supabase = await createClient();
  const found = new Map<string, ProductMatch>();
  const add = (
    product: ProductRow | null,
    matchedBy: ProductMatch["matchedBy"],
    unitsPerCase: number | null,
  ) => {
    if (!product?.active) return;
    const key = `${product.id}:${unitsPerCase ?? ""}`;
    if (!found.has(key)) {
      found.set(key, {
        id: product.id,
        name: product.name,
        brand: product.brand,
        size: product.size,
        soldBy: product.sold_by,
        matchedBy,
        unitsPerCase,
        onHand: null,
      });
    }
  };

  if (supplierId && isUuid(supplierId)) {
    const { data } = await supabase
      .from("supplier_products")
      .select(`units_per_case, product:products!inner(${PRODUCT_FIELDS})`)
      .eq("supplier_id", supplierId)
      .eq("active", true)
      .ilike("supplier_code", term)
      .limit(5);
    for (const row of data ?? []) {
      add(row.product, "supplier_code", row.units_per_case);
    }
  }

  const digits = term.replace(/[\s-]/g, "");
  if (/^\d{8,14}$/.test(digits)) {
    const { data } = await supabase
      .from("product_barcodes")
      .select(
        `pack_type, units_per_pack, product:products!inner(${PRODUCT_FIELDS})`,
      )
      .eq("barcode", digits)
      .eq("active", true);
    for (const row of data ?? []) {
      const isUnit = row.pack_type === "unit";
      add(
        row.product,
        isUnit ? "barcode" : "case_barcode",
        isUnit ? null : row.units_per_pack,
      );
    }
  }

  const { data: byTillCode } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("till_code", term.toUpperCase())
    .eq("active", true);
  for (const product of byTillCode ?? []) {
    add(product, "till_code", null);
  }

  if (found.size === 0 && term.length >= 2) {
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("active", true)
      .or(`name.ilike.*${term}*,brand.ilike.*${term}*`)
      .order("name")
      .limit(12);
    for (const product of data ?? []) {
      add(product, "name", null);
    }
  }

  const matches = [...found.values()];
  if (matches.length > 0) {
    const { data: levels } = await supabase
      .from("stock_levels")
      .select("product_id, quantity_on_hand")
      .in("product_id", [...new Set(matches.map((m) => m.id))]);
    const onHand = new Map(
      (levels ?? []).map((l) => [l.product_id, l.quantity_on_hand]),
    );
    for (const match of matches) {
      match.onHand = onHand.get(match.id) ?? null;
    }
  }
  return matches;
}
