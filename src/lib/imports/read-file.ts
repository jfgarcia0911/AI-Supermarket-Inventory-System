// Reads a CSV or Excel file in the browser. The file itself never leaves the
// user's computer; only the cleaned rows are sent to the server.

import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";

import { type SheetTable, toSheetTable } from "./rows";
import type { Cell } from "./values";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Excel's "CSV" option saves in Windows-1252, where £ is a different byte. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export async function readSpreadsheet(
  file: File,
): Promise<{ table: SheetTable; fingerprint: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      "The file is larger than 10 MB. Split it into smaller files.",
    );
  }
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  let raw: Cell[][];
  if (name.endsWith(".xlsx")) {
    raw = (await readSheet(buffer)) as Cell[][];
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = decodeText(buffer).replace(/^﻿/, "");
    raw = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  } else if (name.endsWith(".xls")) {
    throw new Error(
      "Older .xls files cannot be read. Open the file in Excel and save it as .xlsx or CSV.",
    );
  } else {
    throw new Error("Choose a CSV or Excel (.xlsx) file.");
  }

  return { table: toSheetTable(raw), fingerprint: await sha256Hex(buffer) };
}
