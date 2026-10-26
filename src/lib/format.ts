// Display formatting: pounds, quantities and UK dates in Europe/London time.

const TIME_ZONE = "Europe/London";

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

// Unit costs can need more than two decimals (£0.4167 per can).
const unitCost = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DASH = "—";

export function formatMoney(value: number | null | undefined): string {
  return value == null ? DASH : pounds.format(value);
}

export function formatUnitCost(value: number | null | undefined): string {
  return value == null ? DASH : unitCost.format(value);
}

export function formatQuantity(
  value: number | null | undefined,
  soldBy: "each" | "kg" = "each",
): string {
  if (value == null) {
    return DASH;
  }
  if (soldBy === "kg") {
    return `${value.toLocaleString("en-GB", { maximumFractionDigits: 3 })} kg`;
  }
  return value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return DASH;
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

/** A date-only value such as "2026-10-27", shown as "27 Oct 2026". */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return DASH;
  }
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return date.format(new Date(isDateOnly ? `${value}T12:00:00Z` : value));
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : DASH;
}
