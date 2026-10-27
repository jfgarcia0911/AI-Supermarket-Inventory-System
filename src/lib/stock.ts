// Words used for stock movements across the app.

import type { Database } from "@/lib/supabase/database.types";

export type MovementType = Database["public"]["Enums"]["movement_type"];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening_balance: "Opening stock",
  receipt: "Delivery",
  supplier_return: "Return to supplier",
  sale: "Sale",
  refund: "Refund",
  adjustment: "Adjustment",
  count_correction: "Count correction",
  reversal: "Reversal",
};

/** "+24" or "−3.5 kg", with a proper minus sign. */
export function signedQuantity(
  quantity: number,
  soldBy: "each" | "kg" = "each",
): string {
  const amount = Math.abs(quantity).toLocaleString("en-GB", {
    maximumFractionDigits: 3,
  });
  return `${quantity > 0 ? "+" : "−"}${amount}${soldBy === "kg" ? " kg" : ""}`;
}

/** What public.stock_summary() returns. stock_value is null for stock staff. */
export interface StockSummary {
  low_stock: number;
  negative_stock: number;
  never_counted: number;
  stock_value: number | null;
}
