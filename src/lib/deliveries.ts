// Words used for deliveries across the app.

import type { BadgeColour } from "@/lib/badge-colours";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type DeliveryStatus = Enums["delivery_status"];
export type DocumentType = Enums["document_type"];
export type Discrepancy = Enums["discrepancy"];

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft: "Being checked in",
  checked_in: "Waiting to post",
  posted: "Posted",
  void: "Void",
};

export const STATUS_BADGE: Record<DeliveryStatus, BadgeColour> = {
  draft: "info",
  checked_in: "warning",
  posted: "success",
  void: "destructive",
};

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  invoice: "Delivery",
  credit_note: "Return to supplier",
};

export const DISCREPANCY_LABELS: Record<Discrepancy, string> = {
  none: "No problem",
  short: "Short (fewer arrived)",
  damaged: "Damaged",
  substituted: "Substituted",
  extra: "Extra (more arrived)",
};

/** Field wording differs for a return: cases credited and cases sent back. */
export function quantityLabels(documentType: DocumentType) {
  return documentType === "invoice"
    ? { invoiced: "On the paperwork", received: "Arrived" }
    : { invoiced: "Credited", received: "Sent back" };
}

/**
 * True when a delivery was checked in more than `hours` ago and is still
 * waiting to be posted (the "unposted delivery" limit in Settings).
 */
export function isPostingOverdue(
  checkedInAt: string | null,
  hours: number,
  now: Date = new Date(),
): boolean {
  if (!checkedInAt) {
    return false;
  }
  return now.getTime() - new Date(checkedInAt).getTime() > hours * 3_600_000;
}
