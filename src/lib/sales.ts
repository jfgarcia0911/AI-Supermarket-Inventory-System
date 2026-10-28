// Words and shapes used for till sales across the app.

import type { BadgeColour } from "@/lib/badge-colours";
import { formatDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

export type SalesLineStatus = Database["public"]["Enums"]["sales_line_status"];

export const SALES_LINE_LABELS: Record<SalesLineStatus, string> = {
  matched: "Matched",
  unmatched: "Unmatched",
  ignored: "Ignored",
};

export const SALES_LINE_BADGE: Record<SalesLineStatus, BadgeColour> = {
  matched: "success",
  unmatched: "warning",
  ignored: "outline",
};

/** What public.sales_coverage() returns. */
export interface SalesCoverage {
  needed_from: string | null;
  imported_through: string | null;
  expected_through: string;
  missing_count: number;
  /** The first 31 missing days, oldest first (yyyy-mm-dd). */
  missing_days: string[];
  unmatched_lines: number;
  unmatched_codes: number;
}

/** "22 Oct 2026", or "25 Sep 2026 to 22 Oct 2026". */
export function describePeriod(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end || start === end) {
    return formatDate(start ?? end);
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
}

/**
 * "23 Oct 2026, 24 Oct 2026 and 2 more" — the first few missing days, for a
 * one-line warning.
 */
export function describeMissingDays(
  days: string[],
  total: number,
  shown = 3,
): string {
  const listed = days.slice(0, shown).map((day) => formatDate(day));
  const more = total - listed.length;
  if (more > 0) {
    return `${listed.join(", ")} and ${more} more`;
  }
  if (listed.length <= 1) {
    return listed.join("");
  }
  return `${listed.slice(0, -1).join(", ")} and ${listed.at(-1)}`;
}
