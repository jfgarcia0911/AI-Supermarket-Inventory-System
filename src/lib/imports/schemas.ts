// Server-side check of an import request before it reaches the database.
// The browser builds the rows; never trust them without checking again.

import { z } from "zod";

const MAX_ROWS = 20000;

const productRow = z.object({
  row_number: z.number().int().positive(),
  category: z.string().min(1).max(500),
  name: z.string().min(1).max(120),
  brand: z.string().max(80).nullable(),
  size: z.string().max(40).nullable(),
  sold_by: z.enum(["each", "kg"]).nullable(),
  vat_code: z.string().regex(/^[A-Z]$/),
  sell_price: z.number().nonnegative().max(1_000_000).nullable(),
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable(),
  case_barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable(),
  case_units: z.number().positive().max(100_000).nullable(),
  till_code: z
    .string()
    .regex(/^[A-Z0-9-]{1,20}$/)
    .nullable(),
  reorder_point: z.number().nonnegative().max(1_000_000).nullable(),
  reorder_qty: z.number().positive().max(1_000_000).nullable(),
});

const supplierProductRow = z.object({
  row_number: z.number().int().positive(),
  supplier_code: z.string().min(1).max(40),
  description: z.string().max(200).nullable(),
  product_code: z.string().min(1).max(20),
  units_per_case: z.number().positive().max(100_000),
  case_cost: z.number().nonnegative().max(1_000_000).nullable(),
  preferred: z.boolean().nullable(),
});

const common = {
  fileName: z.string().min(1).max(255),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  mapping: z.record(z.string(), z.number().int().nonnegative().nullable()),
  rowsSkipped: z.number().int().nonnegative(),
};

export const importRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("products"),
    ...common,
    rows: z.array(productRow).max(MAX_ROWS),
  }),
  z.object({
    kind: z.literal("supplier_products"),
    supplierId: z.uuid(),
    ...common,
    rows: z.array(supplierProductRow).max(MAX_ROWS),
  }),
]);

export type ImportRequest = z.infer<typeof importRequestSchema>;

export type ImportResult =
  { ok: true; summary: ImportSummary } | { ok: false; message: string };

export interface ImportSummary {
  rows: number;
  valid: number;
  skipped: number;
  errors: { row: number; message: string }[];
  import_id?: string;
  // Products
  new_products?: number;
  updated_products?: number;
  unchanged_products?: number;
  new_categories?: number;
  new_barcodes?: number;
  // Supplier price lists
  new_links?: number;
  updated_links?: number;
  unchanged_links?: number;
  costs_recorded?: number;
  price_increases?: number;
}
