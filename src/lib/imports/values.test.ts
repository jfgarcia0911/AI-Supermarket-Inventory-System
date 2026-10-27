import { describe, expect, it } from "vitest";

import {
  CellError,
  parseBarcode,
  parseBoolean,
  parseCategoryPath,
  parseNumber,
  parseSaleDate,
  parseSalesCode,
  parseSoldBy,
  parseTillCode,
  parseVatCode,
} from "./values";

describe("parseNumber", () => {
  it("reads plain numbers, pounds and thousands separators", () => {
    expect(parseNumber("1.75", "Price")).toBe(1.75);
    expect(parseNumber("£1,234.50", "Price")).toBe(1234.5);
    expect(parseNumber(3, "Price")).toBe(3);
  });

  it("treats a blank cell as no value", () => {
    expect(parseNumber("  ", "Price")).toBeNull();
    expect(parseNumber(null, "Price")).toBeNull();
  });

  it("explains a value that is not a number", () => {
    expect(() => parseNumber("abc", "Price")).toThrow(
      'Price "abc" is not a number.',
    );
  });
});

describe("parseVatCode", () => {
  it.each([
    ["Z", "Z"],
    ["s", "S"],
    ["Standard", "S"],
    ["20%", "S"],
    ["5", "R"],
    ["0", "Z"],
    [0.2, "S"], // Excel stores 20% as 0.2
  ])("reads %s as %s", (input, expected) => {
    expect(parseVatCode(input)).toBe(expected);
  });

  it("rejects other rates", () => {
    expect(() => parseVatCode("17.5")).toThrow(CellError);
  });
});

describe("parseSoldBy", () => {
  it("understands common words", () => {
    expect(parseSoldBy("Each")).toBe("each");
    expect(parseSoldBy("KG")).toBe("kg");
    expect(parseSoldBy("weighed")).toBe("kg");
    expect(parseSoldBy("")).toBeNull();
  });

  it("rejects anything else", () => {
    expect(() => parseSoldBy("box")).toThrow(CellError);
  });
});

describe("parseBoolean", () => {
  it("reads yes and no", () => {
    expect(parseBoolean("Yes", "Preferred")).toBe(true);
    expect(parseBoolean("n", "Preferred")).toBe(false);
    expect(parseBoolean("", "Preferred")).toBeNull();
  });
});

describe("parseBarcode", () => {
  it("accepts valid barcodes, including ones stored as numbers", () => {
    expect(parseBarcode("4006381333931", "Barcode")).toBe("4006381333931");
    expect(parseBarcode(4006381333931, "Barcode")).toBe("4006381333931");
    expect(parseBarcode(" 4006 3813 33931 ", "Barcode")).toBe("4006381333931");
  });

  it("spots a barcode Excel turned into scientific notation", () => {
    expect(() => parseBarcode("4.00638E+12", "Barcode")).toThrow(
      /shortened by Excel/,
    );
  });

  it("hints at a lost leading zero", () => {
    expect(() => parseBarcode("36000291452", "Barcode")).toThrow(
      /leading zero/,
    );
  });

  it("rejects a wrong check digit", () => {
    expect(() => parseBarcode("4006381333932", "Barcode")).toThrow(
      /not a valid barcode/,
    );
  });
});

describe("parseTillCode", () => {
  it("upper-cases and checks the characters", () => {
    expect(parseTillCode("ab-12")).toBe("AB-12");
    expect(() => parseTillCode("A B")).toThrow(CellError);
  });
});

describe("parseCategoryPath", () => {
  it("tidies the spacing around each level", () => {
    expect(parseCategoryPath("Dairy & Eggs>  Milk ")).toBe(
      "Dairy & Eggs > Milk",
    );
  });

  it("rejects an empty level", () => {
    expect(() => parseCategoryPath("Dairy > > Milk")).toThrow(/empty level/);
  });
});

describe("parseSaleDate", () => {
  it("reads UK dates as day/month/year", () => {
    expect(parseSaleDate("05/10/2026")).toBe("2026-10-05");
    expect(parseSaleDate("5/10/26")).toBe("2026-10-05");
    expect(parseSaleDate("05.10.2026")).toBe("2026-10-05");
    expect(parseSaleDate("05-10-2026")).toBe("2026-10-05");
  });

  it("reads ISO dates, Excel dates and ignores a time of day", () => {
    expect(parseSaleDate("2026-10-05")).toBe("2026-10-05");
    expect(parseSaleDate("22/10/2026 22:00")).toBe("2026-10-22");
    expect(parseSaleDate(new Date(Date.UTC(2026, 9, 22)))).toBe("2026-10-22");
    expect(parseSaleDate(46317)).toBe("2026-10-22");
  });

  it("explains dates it cannot read", () => {
    expect(parseSaleDate("")).toBeNull();
    expect(() => parseSaleDate("31/02/2026")).toThrow("is not a real date");
    expect(() => parseSaleDate("Tuesday")).toThrow(
      "Use day/month/year, for example 22/10/2026.",
    );
  });
});

describe("parseSalesCode", () => {
  it("keeps codes as they are, in capitals", () => {
    expect(parseSalesCode(" dept01 ")).toBe("DEPT01");
    expect(parseSalesCode("1001")).toBe("1001");
    expect(parseSalesCode(5061311000016)).toBe("5061311000016");
  });

  it("spots barcodes Excel has shortened", () => {
    expect(() => parseSalesCode("5.06131E+12")).toThrow(CellError);
  });
});
