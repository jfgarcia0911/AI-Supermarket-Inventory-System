import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface CategoryOption {
  id: string;
  path: string;
  active: boolean;
}

export interface VatRate {
  code: string;
  name: string;
  rate_pct: number;
}

/** Every category with its full path, e.g. "Dairy & Eggs > Milk & Cream". */
export async function getCategoryOptions(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("category_paths")
    .select("id, path, active")
    .order("path");
  return (data ?? []).flatMap((row) =>
    row.id && row.path
      ? [{ id: row.id, path: row.path, active: row.active ?? true }]
      : [],
  );
}

export async function getVatRates(): Promise<VatRate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vat_rates")
    .select("code, name, rate_pct")
    .eq("active", true)
    .order("rate_pct");
  return data ?? [];
}

/** Price before VAT, for margins. */
export function priceExVat(priceIncVat: number, ratePct: number): number {
  return priceIncVat / (1 + ratePct / 100);
}

/** Gross margin on the ex-VAT selling price, as a percentage. */
export function marginPercent(
  sellExVat: number,
  unitCost: number,
): number | null {
  return sellExVat > 0 ? ((sellExVat - unitCost) / sellExVat) * 100 : null;
}
