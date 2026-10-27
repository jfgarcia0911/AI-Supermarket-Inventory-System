// Words used for alerts across the app.

import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type AlertType = Enums["alert_type"];
export type AlertSeverity = Enums["alert_severity"];
export type AlertStatus = Enums["alert_status"];

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  sales_import_missing: "Sales missing",
  ledger_mismatch: "Stock history mismatch",
  negative_stock: "Below zero",
  unposted_delivery: "Delivery not posted",
  unmatched_sales: "Unmatched till lines",
  count_needs_recount: "Count to check",
  unknown_barcode: "Unknown barcode",
  pending_approval: "Waiting for approval",
  low_stock: "Low stock",
};

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

export const SEVERITY_BADGE: Record<
  AlertSeverity,
  "destructive" | "default" | "outline"
> = {
  critical: "destructive",
  warning: "default",
  info: "outline",
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Most serious first, then the most recently seen. */
export function compareAlerts(
  a: { severity: AlertSeverity; last_seen_at: string },
  b: { severity: AlertSeverity; last_seen_at: string },
): number {
  return (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    b.last_seen_at.localeCompare(a.last_seen_at)
  );
}

/** What public.refresh_alerts() returns. */
export interface AlertCounts {
  open: number;
  critical: number;
  warning: number;
}
