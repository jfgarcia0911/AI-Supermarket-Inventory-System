// Words used for stock counts across the app.

import type { BadgeColour } from "@/lib/badge-colours";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type CountScope = Enums["count_scope"];
export type CountStatus = Enums["count_status"];
export type UncountedPolicy = Enums["uncounted_policy"];

export const COUNT_SCOPE_LABELS: Record<CountScope, string> = {
  full: "Full count",
  category: "Category count",
  spot: "Spot check",
  opening: "Opening count",
};

export const COUNT_SCOPE_DESCRIPTIONS: Record<CountScope, string> = {
  full: "Every product in the shop. Products nobody counts can be set to zero.",
  category: "One category and everything under it, such as Dairy & Eggs.",
  spot: "Only the products someone counts. Good for a quick check.",
  opening: "Products that have no opening stock yet.",
};

export const COUNT_STATUS_LABELS: Record<CountStatus, string> = {
  in_progress: "Counting",
  submitted: "Waiting for review",
  approved: "Approved",
  cancelled: "Cancelled",
};

export const COUNT_STATUS_BADGE: Record<CountStatus, BadgeColour> = {
  in_progress: "info",
  submitted: "warning",
  approved: "success",
  cancelled: "outline",
};

/** Where stock is kept; counting each place separately avoids mistakes. */
export const COUNT_LOCATIONS = [
  "Shelf",
  "Stockroom",
  "Chiller",
  "Freezer",
  "Display",
  "Other",
] as const;

/** A row of public.count_review(). */
export interface CountReviewRow {
  product_id: string;
  product_name: string;
  product_size: string | null;
  sold_by: "each" | "kg";
  counted_total: number | null;
  line_count: number;
  expected_qty: number | null;
  variance_qty: number | null;
  unit_cost: number | null;
  flagged: boolean;
  recount_requested: boolean;
  last_counted_at: string | null;
}

/** What public.count_readiness() returns. */
export interface CountReadiness {
  happened: boolean;
  sales_needed_through: string;
  missing_sales_days: string[];
  missing_sales_count: number;
  unposted_deliveries: number;
}
