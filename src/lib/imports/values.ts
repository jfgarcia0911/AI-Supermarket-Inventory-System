// Turning spreadsheet cells into clean values. Each parser returns null for a
// blank cell and throws CellError with a plain-English message for a bad one.

import { isValidGtin } from "@/lib/barcodes";

export type Cell = string | number | boolean | Date | null | undefined;
export type VatCode = "Z" | "R" | "S";
export type SoldBy = "each" | "kg";

export class CellError extends Error {}

export function cellText(value: Cell): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

export function parseText(
  value: Cell,
  label: string,
  maxLength: number,
): string | null {
  const text = cellText(value).replace(/\s+/g, " ");
  if (!text) {
    return null;
  }
  if (text.length > maxLength) {
    throw new CellError(`${label} is longer than ${maxLength} characters.`);
  }
  return text;
}

/** Accepts "1.75", "£1.75" and "1,234.50". */
export function parseNumber(value: Cell, label: string): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CellError(`${label} is not a number.`);
    }
    return value;
  }
  const text = cellText(value).replace(/[£,\s]/g, "");
  if (!text) {
    return null;
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw new CellError(`${label} "${cellText(value)}" is not a number.`);
  }
  return number;
}

const VAT_WORDS: Record<string, VatCode> = {
  z: "Z",
  zero: "Z",
  "zero rated": "Z",
  r: "R",
  reduced: "R",
  s: "S",
  std: "S",
  standard: "S",
};

/** Accepts Z/R/S, the rate ("20", "20%", or Excel's 0.2) or the word. */
export function parseVatCode(value: Cell): VatCode | null {
  const text = cellText(value).toLowerCase().replace(/%$/, "").trim();
  if (!text) {
    return null;
  }
  if (text in VAT_WORDS) {
    return VAT_WORDS[text];
  }
  const number = Number(text);
  if (Number.isFinite(number)) {
    const percent = number > 0 && number < 1 ? number * 100 : number;
    if (Math.abs(percent) < 1e-9) return "Z";
    if (Math.abs(percent - 5) < 1e-9) return "R";
    if (Math.abs(percent - 20) < 1e-9) return "S";
  }
  throw new CellError(
    `VAT "${cellText(value)}" is not Z (0%), R (5%) or S (20%).`,
  );
}

const SOLD_BY_WORDS: Record<string, SoldBy> = {
  each: "each",
  ea: "each",
  unit: "each",
  units: "each",
  item: "each",
  single: "each",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilogram: "kg",
  weight: "kg",
  weighed: "kg",
};

export function parseSoldBy(value: Cell): SoldBy | null {
  const text = cellText(value).toLowerCase();
  if (!text) {
    return null;
  }
  const soldBy = SOLD_BY_WORDS[text];
  if (!soldBy) {
    throw new CellError(
      `Sold by "${cellText(value)}" should be "each" or "kg".`,
    );
  }
  return soldBy;
}

export function parseBoolean(value: Cell, label: string): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  const text = cellText(value).toLowerCase();
  if (!text) {
    return null;
  }
  if (["yes", "y", "true", "1"].includes(text)) return true;
  if (["no", "n", "false", "0"].includes(text)) return false;
  throw new CellError(`${label} "${cellText(value)}" should be Yes or No.`);
}

export function parseBarcode(value: Cell, label: string): string | null {
  const raw = typeof value === "number" ? value.toFixed(0) : cellText(value);
  if (!raw) {
    return null;
  }
  if (/e\+/i.test(raw)) {
    throw new CellError(
      `${label} "${raw}" was shortened by Excel. Format the column as Text and save the file again.`,
    );
  }
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) {
    throw new CellError(`${label} "${raw}" should contain digits only.`);
  }
  if (!isValidGtin(digits)) {
    const hint =
      digits.length === 7 || digits.length === 11
        ? " It may have lost a leading zero."
        : "";
    throw new CellError(`${label} ${digits} is not a valid barcode.${hint}`);
  }
  return digits;
}

export function parseTillCode(value: Cell): string | null {
  const code = cellText(value).toUpperCase();
  if (!code) {
    return null;
  }
  if (!/^[A-Z0-9-]{1,20}$/.test(code)) {
    throw new CellError(
      `Till code "${code}" may only use letters, numbers and dashes (up to 20).`,
    );
  }
  return code;
}

/** "Dairy & Eggs >Milk" becomes "Dairy & Eggs > Milk". */
export function parseCategoryPath(value: Cell): string | null {
  const text = cellText(value);
  if (!text) {
    return null;
  }
  const parts = text.split(">").map((part) => part.trim().replace(/\s+/g, " "));
  if (parts.some((part) => part === "")) {
    throw new CellError(`Category "${text}" has an empty level.`);
  }
  if (parts.some((part) => part.length > 80)) {
    throw new CellError("Each category name must be 80 characters or fewer.");
  }
  return parts.join(" > ");
}
