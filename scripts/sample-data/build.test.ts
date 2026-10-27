import { describe, expect, it } from "vitest";

import { isValidGtin } from "../../src/lib/barcodes";
import {
  buildCatalogue,
  buildDailySales,
  buildDeliveries,
  buildOpeningStock,
  CARRIER_BAG_CODE,
  deliveryWeekdays,
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

describe("deliveries", () => {
  const days = Array.from({ length: 28 }, (_, i) =>
    new Date(Date.UTC(2026, 8, 25 + i)).toISOString().slice(0, 10),
  );
  const openingStock = buildOpeningStock(products);
  const deliveries = buildDeliveries(
    products,
    supplierProducts,
    openingStock,
    days,
  );

  it("reads delivery days", () => {
    expect(deliveryWeekdays("Mon-Sat")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(deliveryWeekdays("Mon, Wed, Fri")).toEqual([1, 3, 5]);
    expect(deliveryWeekdays("Thu")).toEqual([4]);
    expect(deliveryWeekdays("Daily")).toHaveLength(7);
  });

  it("only comes on each supplier's delivery days, in whole cases", () => {
    for (const delivery of deliveries) {
      const weekday = new Date(
        `${delivery.deliveredAt.slice(0, 10)}T12:00:00Z`,
      ).getUTCDay();
      expect(deliveryWeekdays(delivery.supplier.deliveryDays)).toContain(
        weekday,
      );
      for (const line of delivery.lines) {
        expect(Number.isInteger(line.cases)).toBe(true);
        expect(line.cases).toBeGreaterThan(0);
        expect(line.supplierProduct.preferred).toBe(true);
      }
    }
  });

  it("keeps the shelves stocked: almost no product runs out", () => {
    const stock = new Map(openingStock.map((r) => [r.product, r.quantity]));
    const byCode = new Map(products.map((p) => [p.barcode || p.tillCode, p]));
    let productDays = 0;
    let outOfStock = 0;
    for (const day of days) {
      for (const delivery of deliveries.filter((d) =>
        d.deliveredAt.startsWith(day),
      )) {
        for (const { supplierProduct, cases } of delivery.lines) {
          const { product } = supplierProduct;
          stock.set(
            product,
            (stock.get(product) ?? 0) + cases * supplierProduct.unitsPerCase,
          );
        }
      }
      for (const sale of buildDailySales(products, day)) {
        const product = byCode.get(sale.code);
        if (product) stock.set(product, (stock.get(product) ?? 0) - sale.qty);
      }
      for (const quantity of stock.values()) {
        productDays++;
        if (quantity < 0) outOfStock++;
      }
    }
    expect(outOfStock / productDays).toBeLessThan(0.01);
  });
});
