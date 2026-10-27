// Proves the sales import rules hold in the database itself: who may import,
// that previews save nothing, that a file or a day cannot be imported twice,
// that unknown codes are kept to be matched later, and that reversing an
// import puts the stock back.
//
// Sales go to the switched-off test product on early-September days before
// the sample data starts. The import is reversed at the end (also if a test
// fails), so its days are free again and the stock ends where it started.

import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SalesImportRow } from "@/lib/imports/rows";

import {
  type SignedIn,
  signInAll,
  TEST_BARCODE,
  useTestProduct,
} from "./helpers";

const DAY = "2026-09-01";
const NEXT_DAY = "2026-09-02";
// 22:00 UK time (BST) is the end of the trading day.
const DAY_ENDS_AT = "2026-09-01T21:00:00+00:00";
const run = Date.now().toString(36).toUpperCase();
const CODE_TO_MATCH = `DBTEST-${run}-A`;
const CODE_TO_IGNORE = `DBTEST-${run}-B`;
const FILE_NAME = `db-test-sales-${run}.csv`;
const FINGERPRINT = randomBytes(32).toString("hex");

let owner: SignedIn;
let manager: SignedIn;
let staff: SignedIn;
let productId: string;
let onHand: () => Promise<number>;
let switchOff: () => Promise<void>;
let startingStock: number;
let importId: string;

const line = (
  row_number: number,
  code: string,
  quantity: number,
  sale_date = DAY,
): SalesImportRow => ({
  row_number,
  sale_date,
  code,
  description: "Database test line",
  quantity,
  net_value: null,
  gross_value: null,
});

const FILE = [
  line(2, TEST_BARCODE, 3),
  line(3, TEST_BARCODE, -1),
  line(4, CODE_TO_MATCH, 2),
  line(5, CODE_TO_IGNORE, 1),
];

function importSales(
  who: SignedIn,
  rows: SalesImportRow[],
  options: { fingerprint?: string; dryRun?: boolean } = {},
) {
  return who.db.rpc("import_sales", {
    p_rows: rows,
    p_file_name: FILE_NAME,
    p_fingerprint: options.fingerprint ?? randomBytes(32).toString("hex"),
    p_dry_run: options.dryRun ?? true,
  });
}

beforeAll(async () => {
  ({ owner, manager, staff } = await signInAll());
  ({ productId, onHand, switchOff } = await useTestProduct(owner));
  startingStock = await onHand();
});

afterAll(async () => {
  if (!owner) return;
  const { data: leftovers } = await owner.db
    .from("imports")
    .select("id")
    .like("file_name", "db-test-sales-%")
    .eq("status", "committed");
  for (const row of leftovers ?? []) {
    await owner.db.rpc("reverse_sales_import", {
      p_import_id: row.id,
      p_reason: "Database test clean-up",
    });
  }
  await owner.db.rpc("forget_sales_code_rule", { p_code: CODE_TO_IGNORE });
  await switchOff?.();
});

describe("importing sales", () => {
  it("is refused for stock staff, who cannot see sales lines either", async () => {
    const { error } = await importSales(staff, FILE);
    expect(error?.code).toBe("42501");
    const { data } = await staff.db
      .from("sales_import_lines")
      .select("id")
      .limit(5);
    expect(data).toEqual([]);
  });

  it("previews what will happen and saves nothing", async () => {
    const { data, error } = await importSales(manager, FILE, {
      fingerprint: FINGERPRINT,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      valid: 4,
      matched: 2,
      unmatched: 2,
      refunds: 1,
      units_sold: 2,
      days: 1,
      blocked: null,
      errors: [],
    });
    expect(await onHand()).toBe(startingStock);
    const { data: saved } = await owner.db
      .from("imports")
      .select("id")
      .eq("file_fingerprint", FINGERPRINT);
    expect(saved).toEqual([]);
  });

  it("refuses dates in the future", async () => {
    const tomorrow = new Date(Date.now() + 2 * 864e5)
      .toISOString()
      .slice(0, 10);
    const { data } = await importSales(manager, [
      line(2, TEST_BARCODE, 1, tomorrow),
    ]);
    expect(data).toMatchObject({
      valid: 0,
      errors: [{ row: 2, message: expect.stringContaining("in the future") }],
    });
  });

  it("takes sales off stock, dated at the end of the trading day", async () => {
    const { data, error } = await importSales(manager, FILE, {
      fingerprint: FINGERPRINT,
      dryRun: false,
    });
    expect(error).toBeNull();
    importId = (data as { import_id: string }).import_id;
    expect(await onHand()).toBe(startingStock - 2);

    const { data: movements } = await owner.db
      .from("stock_movements")
      .select("movement_type, quantity, occurred_at")
      .eq("product_id", productId)
      .eq("source_type", "sales_line")
      .eq("occurred_at", DAY_ENDS_AT);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ movement_type: "sale", quantity: -3 }),
        expect.objectContaining({ movement_type: "refund", quantity: 1 }),
      ]),
    );
  });

  it("refuses the same file twice", async () => {
    const preview = await importSales(manager, FILE, {
      fingerprint: FINGERPRINT,
    });
    expect(preview.data).toMatchObject({
      blocked: expect.stringContaining("This file was already imported"),
    });
    const real = await importSales(manager, FILE, {
      fingerprint: FINGERPRINT,
      dryRun: false,
    });
    expect(real.error?.message).toContain("This file was already imported");
  });

  it("refuses a day that was already imported, even from another file", async () => {
    const { error } = await importSales(manager, [line(2, TEST_BARCODE, 5)], {
      dryRun: false,
    });
    expect(error?.message).toContain("were already imported from");
    expect(await onHand()).toBe(startingStock - 2);
  });
});

describe("unmatched lines", () => {
  it("can be matched to a product later, dated on the day they were sold", async () => {
    const { data, error } = await manager.db.rpc("match_sales_code", {
      p_code: CODE_TO_MATCH,
      p_product_id: productId,
      p_remember: false,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ matched: 1, units: 2, remembered: null });
    expect(await onHand()).toBe(startingStock - 4);

    const { data: lines } = await owner.db
      .from("sales_import_lines")
      .select("status, movement:stock_movements(occurred_at)")
      .eq("import_id", importId)
      .eq("code", CODE_TO_MATCH);
    expect(lines).toEqual([
      { status: "matched", movement: { occurred_at: DAY_ENDS_AT } },
    ]);
  });

  it("can be ignored, now and in future imports", async () => {
    const { data, error } = await manager.db.rpc("ignore_sales_code", {
      p_code: CODE_TO_IGNORE,
      p_always: true,
    });
    expect(error).toBeNull();
    expect(data).toBe(1);

    const later = await importSales(manager, [
      line(2, CODE_TO_IGNORE, 4, NEXT_DAY),
    ]);
    expect(later.data).toMatchObject({ ignored: 1, unmatched: 0 });

    await manager.db.rpc("forget_sales_code_rule", { p_code: CODE_TO_IGNORE });
    const afterForgetting = await importSales(manager, [
      line(2, CODE_TO_IGNORE, 4, NEXT_DAY),
    ]);
    expect(afterForgetting.data).toMatchObject({ ignored: 0, unmatched: 1 });
  });

  it("cannot be matched by stock staff", async () => {
    const { error } = await staff.db.rpc("match_sales_code", {
      p_code: CODE_TO_MATCH,
      p_product_id: productId,
    });
    expect(error?.code).toBe("42501");
  });
});

describe("reversing an import", () => {
  it("is for owners only, and puts the stock back", async () => {
    const byManager = await manager.db.rpc("reverse_sales_import", {
      p_import_id: importId,
      p_reason: "Database test",
    });
    expect(byManager.error?.code).toBe("42501");

    const byOwner = await owner.db.rpc("reverse_sales_import", {
      p_import_id: importId,
      p_reason: "Database test",
    });
    expect(byOwner.error).toBeNull();
    expect(byOwner.data).toBe(3);
    expect(await onHand()).toBe(startingStock);
  });

  it("frees its days to be imported again", async () => {
    const { data } = await importSales(manager, FILE, {
      fingerprint: FINGERPRINT,
    });
    expect(data).toMatchObject({ blocked: null, matched: 2 });
  });

  it("leaves every stock level matching its movements", async () => {
    const { data, error } = await owner.db.rpc("stock_ledger_mismatches");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
