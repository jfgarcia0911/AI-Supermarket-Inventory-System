import { describe, expect, it } from "vitest";

import { gtinCheckDigit, isValidGtin, withCheckDigit } from "./barcodes";

describe("gtinCheckDigit", () => {
  it.each([
    ["400638133393", 1], // EAN-13
    ["03600029145", 2], // UPC-A
    ["9638507", 4], // EAN-8
  ])("computes the check digit for %s", (body, expected) => {
    expect(gtinCheckDigit(body)).toBe(expected);
  });

  it("rejects bodies that are not all digits", () => {
    expect(() => gtinCheckDigit("12A4")).toThrow();
  });
});

describe("isValidGtin", () => {
  it("accepts valid EAN-13, UPC-A and EAN-8 barcodes", () => {
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(isValidGtin("036000291452")).toBe(true);
    expect(isValidGtin("96385074")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidGtin("4006381333932")).toBe(false);
  });

  it("rejects unsupported lengths and non-digits", () => {
    expect(isValidGtin("")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
    expect(isValidGtin("40063813339 1")).toBe(false);
  });

  it("accepts a GTIN-14 case barcode built from a unit barcode", () => {
    const caseBarcode = withCheckDigit(`1${"4006381333931".slice(0, 12)}`);
    expect(caseBarcode).toHaveLength(14);
    expect(isValidGtin(caseBarcode)).toBe(true);
  });
});
