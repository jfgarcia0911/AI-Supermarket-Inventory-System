// Builds clean import rows from a spreadsheet, using the chosen column mapping.
// Rows with problems are returned separately with a message for the user. The
// database checks everything again when the import is previewed and run.

import type { ColumnMapping } from "./fields";
import {
  type Cell,
  CellError,
  cellText,
  parseBarcode,
  parseBoolean,
  parseCategoryPath,
  parseNumber,
  parseSaleDate,
  parseSalesCode,
  parseSoldBy,
  parseText,
  parseTillCode,
  parseVatCode,
  type SoldBy,
  type VatCode,
} from "./values";

export interface SheetRow {
  /** Row number as the user sees it in their spreadsheet. */
  rowNumber: number;
  cells: Cell[];
}

export interface SheetTable {
  headers: string[];
  rows: SheetRow[];
}

export interface RowError {
  row: number;
  message: string;
}

// Row types are `type` aliases, not interfaces, so they count as plain JSON
// when passed to the database import functions.
export type ProductImportRow = {
  row_number: number;
  category: string;
  name: string;
  brand: string | null;
  size: string | null;
  sold_by: SoldBy | null;
  vat_code: VatCode;
  sell_price: number | null;
  barcode: string | null;
  case_barcode: string | null;
  case_units: number | null;
  till_code: string | null;
  reorder_point: number | null;
  reorder_qty: number | null;
};

export type SupplierProductImportRow = {
  row_number: number;
  supplier_code: string;
  description: string | null;
  product_code: string;
  units_per_case: number;
  case_cost: number | null;
  preferred: boolean | null;
};

export type OpeningStockImportRow = {
  row_number: number;
  product_code: string;
  quantity: number;
  unit_cost: number | null;
};

export type SalesImportRow = {
  row_number: number;
  /** yyyy-mm-dd */
  sale_date: string;
  code: string;
  description: string | null;
  quantity: number;
  net_value: number | null;
  gross_value: number | null;
};

export interface BuiltRows<T> {
  rows: T[];
  errors: RowError[];
  /** Rows left out on purpose, such as another supplier's lines. */
  ignored: number;
}

/** The first non-empty row is the header; fully empty rows are dropped. */
export function toSheetTable(raw: Cell[][]): SheetTable {
  const isEmpty = (cells: Cell[]) =>
    cells.every((cell) => cellText(cell) === "");
  const headerIndex = raw.findIndex((cells) => !isEmpty(cells));
  if (headerIndex === -1) {
    throw new Error("The file is empty.");
  }
  return {
    headers: raw[headerIndex].map((cell) => cellText(cell)),
    rows: raw
      .slice(headerIndex + 1)
      .map((cells, i) => ({ rowNumber: headerIndex + i + 2, cells }))
      .filter((row) => !isEmpty(row.cells)),
  };
}

function cellGetter(row: SheetRow, mapping: ColumnMapping) {
  return (key: string): Cell => {
    const index = mapping[key];
    return index == null ? null : row.cells[index];
  };
}

function nonNegative(value: number | null, label: string): number | null {
  if (value != null && value < 0) {
    throw new CellError(`${label} cannot be negative.`);
  }
  return value;
}

export function buildProductRows(
  table: SheetTable,
  mapping: ColumnMapping,
): BuiltRows<ProductImportRow> {
  const rows: ProductImportRow[] = [];
  const errors: RowError[] = [];

  for (const sheetRow of table.rows) {
    const get = cellGetter(sheetRow, mapping);
    try {
      const name = parseText(get("name"), "The product name", 120);
      if (!name) throw new CellError("The product name is missing.");
      const category = parseCategoryPath(get("category"));
      if (!category) throw new CellError("The category is missing.");
      const vatCode = parseVatCode(get("vat_code"));
      if (!vatCode) throw new CellError("The VAT code is missing.");

      const barcode = parseBarcode(get("barcode"), "Barcode");
      const tillCode = parseTillCode(get("till_code"));
      if (!barcode && !tillCode) {
        throw new CellError("Each row needs a barcode or a till code.");
      }

      const caseBarcode = parseBarcode(get("case_barcode"), "Case barcode");
      const caseUnits = parseNumber(get("case_units"), "Units in a case");
      if (caseBarcode && !(caseUnits && caseUnits > 0)) {
        throw new CellError(
          "A case barcode needs the number of units in the case.",
        );
      }

      const reorderQty = parseNumber(get("reorder_qty"), "Reorder quantity");
      if (reorderQty != null && reorderQty <= 0) {
        throw new CellError("Reorder quantity must be more than zero.");
      }

      rows.push({
        row_number: sheetRow.rowNumber,
        category,
        name,
        brand: parseText(get("brand"), "Brand", 80),
        size: parseText(get("size"), "Size", 40),
        sold_by: parseSoldBy(get("sold_by")),
        vat_code: vatCode,
        sell_price: nonNegative(
          parseNumber(get("sell_price"), "Selling price"),
          "Selling price",
        ),
        barcode,
        case_barcode: caseBarcode,
        case_units: caseBarcode ? caseUnits : null,
        till_code: tillCode,
        reorder_point: nonNegative(
          parseNumber(get("reorder_point"), "Reorder point"),
          "Reorder point",
        ),
        reorder_qty: reorderQty,
      });
    } catch (error) {
      if (!(error instanceof CellError)) throw error;
      errors.push({ row: sheetRow.rowNumber, message: error.message });
    }
  }
  return { rows, errors, ignored: 0 };
}

export function buildSupplierProductRows(
  table: SheetTable,
  mapping: ColumnMapping,
  supplierName: string,
): BuiltRows<SupplierProductImportRow> {
  const rows: SupplierProductImportRow[] = [];
  const errors: RowError[] = [];
  let ignored = 0;
  const wantedSupplier = supplierName.trim().toLowerCase();

  for (const sheetRow of table.rows) {
    const get = cellGetter(sheetRow, mapping);
    if (mapping.supplier_name != null) {
      const rowSupplier = cellText(get("supplier_name")).toLowerCase();
      if (rowSupplier && rowSupplier !== wantedSupplier) {
        ignored++;
        continue;
      }
    }
    try {
      const supplierCode = parseText(
        get("supplier_code"),
        "The supplier's code",
        40,
      );
      if (!supplierCode)
        throw new CellError("The supplier's product code is missing.");

      const productCode =
        parseBarcode(get("product_barcode"), "Barcode") ??
        parseTillCode(get("product_till_code"));
      if (!productCode) {
        throw new CellError(
          "The barcode or till code of our product is missing.",
        );
      }

      const unitsPerCase = parseNumber(get("units_per_case"), "Units per case");
      if (!(unitsPerCase && unitsPerCase > 0)) {
        throw new CellError("Units per case must be more than zero.");
      }

      rows.push({
        row_number: sheetRow.rowNumber,
        supplier_code: supplierCode,
        description: parseText(get("description"), "The description", 200),
        product_code: productCode,
        units_per_case: unitsPerCase,
        case_cost: nonNegative(
          parseNumber(get("case_cost"), "Case cost"),
          "Case cost",
        ),
        preferred: parseBoolean(get("preferred"), "Preferred"),
      });
    } catch (error) {
      if (!(error instanceof CellError)) throw error;
      errors.push({ row: sheetRow.rowNumber, message: error.message });
    }
  }
  return { rows, errors, ignored };
}

export function buildOpeningStockRows(
  table: SheetTable,
  mapping: ColumnMapping,
): BuiltRows<OpeningStockImportRow> {
  const rows: OpeningStockImportRow[] = [];
  const errors: RowError[] = [];

  for (const sheetRow of table.rows) {
    const get = cellGetter(sheetRow, mapping);
    try {
      const productCode =
        parseBarcode(get("product_barcode"), "Barcode") ??
        parseTillCode(get("product_till_code"));
      if (!productCode) {
        throw new CellError("The barcode or till code is missing.");
      }
      const quantity = parseNumber(get("quantity"), "The quantity counted");
      if (quantity == null) {
        throw new CellError("The quantity counted is missing.");
      }

      rows.push({
        row_number: sheetRow.rowNumber,
        product_code: productCode,
        quantity: nonNegative(quantity, "The quantity counted") as number,
        unit_cost: nonNegative(
          parseNumber(get("unit_cost"), "The unit cost"),
          "The unit cost",
        ),
      });
    } catch (error) {
      if (!(error instanceof CellError)) throw error;
      errors.push({ row: sheetRow.rowNumber, message: error.message });
    }
  }
  return { rows, errors, ignored: 0 };
}

/** Lines with nothing sold (quantity 0) are left out and counted as ignored. */
export function buildSalesRows(
  table: SheetTable,
  mapping: ColumnMapping,
): BuiltRows<SalesImportRow> {
  const rows: SalesImportRow[] = [];
  const errors: RowError[] = [];
  let ignored = 0;

  for (const sheetRow of table.rows) {
    const get = cellGetter(sheetRow, mapping);
    try {
      const saleDate = parseSaleDate(get("sale_date"));
      if (!saleDate) throw new CellError("The date is missing.");
      const code = parseSalesCode(get("code"));
      if (!code) throw new CellError("The item code is missing.");
      const quantity = parseNumber(get("quantity"), "The quantity sold");
      if (quantity == null)
        throw new CellError("The quantity sold is missing.");
      if (quantity === 0) {
        ignored++;
        continue;
      }

      rows.push({
        row_number: sheetRow.rowNumber,
        sale_date: saleDate,
        code,
        description: parseText(get("description"), "The description", 200),
        quantity: Math.round(quantity * 1000) / 1000,
        net_value: parseNumber(get("net_value"), "Sales before VAT"),
        gross_value: parseNumber(get("gross_value"), "Sales including VAT"),
      });
    } catch (error) {
      if (!(error instanceof CellError)) throw error;
      errors.push({ row: sheetRow.rowNumber, message: error.message });
    }
  }
  return { rows, errors, ignored };
}
