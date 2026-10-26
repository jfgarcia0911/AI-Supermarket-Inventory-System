import { readFileSync } from "node:fs";

import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { autoMatchColumns, IMPORT_FIELDS, mappingProblems } from "./fields";
import {
  buildProductRows,
  buildSupplierProductRows,
  toSheetTable,
} from "./rows";

function sampleTable(file: string) {
  const text = readFileSync(
    new URL(`../../../sample-data/${file}`, import.meta.url),
    "utf8",
  );
  return toSheetTable(Papa.parse<string[]>(text).data);
}

describe("toSheetTable", () => {
  it("uses the first non-empty row as headers and keeps spreadsheet row numbers", () => {
    const table = toSheetTable([
      [],
      ["Name", "Price"],
      ["Milk", "1.75"],
      ["", ""],
      ["Bread", "1.45"],
    ]);
    expect(table.headers).toEqual(["Name", "Price"]);
    expect(table.rows.map((row) => row.rowNumber)).toEqual([3, 5]);
  });
});

describe("autoMatchColumns", () => {
  it("prefers the more specific header", () => {
    const mapping = autoMatchColumns(
      ["Description", "Product Name"],
      IMPORT_FIELDS.products,
    );
    expect(mapping.name).toBe(1);
  });

  it("never uses one column twice", () => {
    const mapping = autoMatchColumns(
      ["Barcode"],
      IMPORT_FIELDS.supplier_products,
    );
    expect(mapping.product_barcode).toBe(0);
    expect(Object.values(mapping).filter((index) => index === 0)).toHaveLength(
      1,
    );
  });
});

describe("product import rows", () => {
  const table = sampleTable("products.csv");
  const mapping = autoMatchColumns(table.headers, IMPORT_FIELDS.products);

  it("matches every column of the sample file", () => {
    expect(mappingProblems("products", mapping)).toEqual([]);
    expect(Object.values(mapping).every((index) => index !== null)).toBe(true);
  });

  it("builds a clean row for every sample product", () => {
    const built = buildProductRows(table, mapping);
    expect(built.errors).toEqual([]);
    expect(built.rows).toHaveLength(table.rows.length);

    const bananas = built.rows.find((row) => row.name === "Bananas");
    expect(bananas).toMatchObject({
      category: "Fresh Produce > Fruit",
      sold_by: "kg",
      vat_code: "Z",
      sell_price: 0.98,
      barcode: null,
      till_code: "1001",
    });
  });

  it("reports problems per row, using the spreadsheet's row numbers", () => {
    const bad = toSheetTable([
      ["Product Name", "Category", "VAT", "Barcode"],
      ["Milk", "Dairy", "S", "4006381333931"],
      ["", "Dairy", "S", "4006381333931"],
      ["Bread", "Bakery", "S", ""],
      ["Tea", "Drinks", "17.5", "4006381333931"],
    ]);
    const built = buildProductRows(
      bad,
      autoMatchColumns(bad.headers, IMPORT_FIELDS.products),
    );
    expect(built.rows).toHaveLength(1);
    expect(built.errors).toEqual([
      { row: 3, message: "The product name is missing." },
      { row: 4, message: "Each row needs a barcode or a till code." },
      { row: 5, message: 'VAT "17.5" is not Z (0%), R (5%) or S (20%).' },
    ]);
  });
});

describe("supplier price list rows", () => {
  const table = sampleTable("supplier-products.csv");
  const mapping = autoMatchColumns(
    table.headers,
    IMPORT_FIELDS.supplier_products,
  );

  it("keeps only the chosen supplier's rows", () => {
    expect(mappingProblems("supplier_products", mapping)).toEqual([]);
    const built = buildSupplierProductRows(table, mapping, "Fresh Dairy Ltd");
    expect(built.errors).toEqual([]);
    expect(built.rows.length).toBeGreaterThan(0);
    expect(built.rows.length + built.ignored).toBe(table.rows.length);
    expect(built.rows.every((row) => row.supplier_code.startsWith("FD-"))).toBe(
      true,
    );
  });

  it("uses the till code when a product has no barcode", () => {
    const built = buildSupplierProductRows(table, mapping, "Valley Foods Ltd");
    const bananas = built.rows.find(
      (row) => row.description === "BANANAS 18KG BOX",
    );
    expect(bananas).toMatchObject({
      product_code: "1001",
      units_per_case: 18,
      preferred: true,
    });
  });
});
