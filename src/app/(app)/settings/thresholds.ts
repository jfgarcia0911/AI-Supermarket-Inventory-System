/** The limits owners can change on the Settings page (rows in public.settings). */
export const THRESHOLD_KEYS = [
  "adjustment_approval_units",
  "adjustment_approval_value",
  "recount_units",
  "recount_value",
  "unposted_delivery_hours",
] as const;

export type ThresholdKey = (typeof THRESHOLD_KEYS)[number];

export const THRESHOLD_LABELS: Record<ThresholdKey, string> = {
  adjustment_approval_units: "Adjustment approval: units",
  adjustment_approval_value: "Adjustment approval: value (£)",
  recount_units: "Recount flag: units",
  recount_value: "Recount flag: value (£)",
  unposted_delivery_hours: "Unposted delivery alert: hours",
};
