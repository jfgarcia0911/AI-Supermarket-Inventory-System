import { describe, expect, it } from "vitest";

import { isValidGtin } from "../../src/lib/barcodes";
import {
  buildCatalogue,
  buildDailySales,
  CARRIER_BAG_CODE,
  PROTEIN_BAR_CODE,
} from "./build";
import { VAT_RATES } from "./catalogue";

const { products, supplierProducts } = buildCatalogue();

describe("sample catalogue", () => {
  it("gives every product a valid, unique barcode or a unique till code", () => {
    const codes = products.map((p) => p.barcode || p.tillCode);
    expect(new Set(codes).size).toBe(products.length);

    for (const product of products) {
      if (product.tillCode) {
        expect(product.barcode).toBe("");
      } else {
        expect(isValidGtin(product.barcode)).toBe(true);
        expect(isValidGtin(product.caseBarcode)).toBe(true);
      }
    }
  });

  it("sells weighed items on till codes", () => {
    for (const product of products.filter((p) => p.soldBy === "kg")) {
      expect(product.tillCode).not.toBe("");
    }
  });

  it("buys every product below its ex-VAT selling price", () => {
    for (const row of supplierProducts) {
      const { product } = row;
      const sellExVat = product.sellPrice / (1 + VAT_RATES[product.vatCode]);
      const unitCost = row.caseCostExVat / row.unitsPerCase;
      expect(unitCost).toBeGreaterThan(0);
      expect(unitCost).toBeLessThan(sellExVat);
    }
  });

  it("has exactly one preferred supplier per product", () => {
    const preferred = supplierProducts.filter((row) => row.preferred);
    expect(preferred).toHaveLength(products.length);
  });
});

describe("daily sales", () => {
  it("is identical every time it is generated", () => {
    expect(buildDailySales(products, "2026-10-22")).toEqual(
      buildDailySales(products, "2026-10-22"),
    );
  });

  it("uses whole numbers for items and keeps gross = net + VAT", () => {
    const eachCodes = new Set(
      products
        .filter((p) => p.soldBy === "each")
        .map((p) => p.barcode || p.tillCode),
    );
    for (const row of buildDailySales(products, "2026-10-17")) {
      if (eachCodes.has(row.code)) {
        expect(Number.isInteger(row.qty)).toBe(true);
      }
      expect(row.net + row.vat).toBeCloseTo(row.gross, 2);
    }
  });

  it("includes till lines that are not in the catalogue", () => {
    const known = new Set(products.map((p) => p.barcode || p.tillCode));
    const unmatched = buildDailySales(products, "2026-10-20")
      .map((row) => row.code)
      .filter((code) => !known.has(code));
    expect(unmatched).toEqual(expect.arrayContaining([CARRIER_BAG_CODE]));
    expect(unmatched).toContain(PROTEIN_BAR_CODE);
  });

  it("starts selling the new protein bar from 15 October", () => {
    const codes = buildDailySales(products, "2026-10-01").map((r) => r.code);
    expect(codes).not.toContain(PROTEIN_BAR_CODE);
  });
});
