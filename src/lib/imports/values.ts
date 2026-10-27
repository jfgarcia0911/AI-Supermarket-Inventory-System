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

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A sales date as yyyy-mm-dd. Dates are read the UK way (day/month/year);
 * yyyy-mm-dd and Excel dates work too. Any time after the date is ignored.
 */
export function parseSaleDate(value: Cell): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new CellError("The date is not a real date.");
    }
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel stores dates as days since 30 Dec 1899.
    if (value > 20000 && value < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 864e5);
      return date.toISOString().slice(0, 10);
    }
    throw new CellError(`Date "${value}" is not a date.`);
  }
  const text = cellText(value);
  if (!text) {
    return null;
  }
  const datePart = text.split(/[\sT]/)[0];
  let iso: string | null = null;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
  if (match) {
    iso = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(datePart);
    if (!match) {
      throw new CellError(
        `Date "${text}" is not a date. Use day/month/year, for example 22/10/2026.`,
      );
    }
    const year = Number(match[3]);
    iso = isoDate(
      match[3].length === 2 ? 2000 + year : year,
      Number(match[2]),
      Number(match[1]),
    );
  }
  if (!iso) {
    throw new CellError(`Date "${text}" is not a real date.`);
  }
  return iso;
}

/**
 * The code on a till line: a barcode, a till code or anything else the till
 * uses. Kept as it is (in capitals) so unknown codes can be matched later.
 */
export function parseSalesCode(value: Cell): string | null {
  const raw =
    typeof value === "number" && Number.isInteger(value)
      ? value.toFixed(0)
      : cellText(value);
  if (!raw) {
    return null;
  }
  if (/^\d+(\.\d+)?e\+\d+$/i.test(raw)) {
    throw new CellError(
      `Item code "${raw}" was shortened by Excel. Format the column as Text and save the file again.`,
    );
  }
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (code.length > 40) {
    throw new CellError(`Item code "${raw}" is longer than 40 characters.`);
  }
  return code;
}
