// Proves the stock ledger rules hold in the database itself: who may record
// and post deliveries, that the numbers have to add up, that history cannot
// be rewritten, and when adjustments need approval.
//
// Everything happens to one switched-off test product, which is switched on
// only while the tests run. Every change is undone by a matching one (a void,
// or an adjustment the other way), so its stock ends where it started. The
// history stays, because stock movements can never be deleted.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type SignedIn,
  signInAll,
  TEST_BARCODE,
  useTestProduct,
} from "./helpers";

const SUPPLIER = "Fresh Dairy Ltd";
const CASE_COST = 4.5;
const UNITS_PER_CASE = 6;

let owner: SignedIn;
let manager: SignedIn;
let staff: SignedIn;
let viewer: SignedIn;
let productId: string;
let supplierId: string;
let startingStock: number;
let onHand: () => Promise<number>;
let switchOff: () => Promise<void>;

async function reasonId(name: string): Promise<string> {
  const { data, error } = await staff.db
    .from("adjustment_reasons")
    .select("id")
    .eq("name", name)
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  ({ owner, manager, staff, viewer } = await signInAll());
  ({ productId, onHand, switchOff } = await useTestProduct(owner));

  const { data: supplier } = await owner.db
    .from("suppliers")
    .select("id")
    .eq("name", SUPPLIER)
    .single();
  supplierId = supplier!.id;
  startingStock = await onHand();
});

afterAll(async () => {
  await switchOff?.();
});

describe("the stock ledger", () => {
  it("cannot be written to directly, even by owners", async () => {
    const { data: store } = await owner.db
      .from("stores")
      .select("id")
      .limit(1)
      .single();
    const insert = await owner.db.from("stock_movements").insert({
      store_id: store!.id,
      product_id: productId,
      movement_type: "adjustment",
      quantity: 100,
      occurred_at: new Date().toISOString(),
    });
    const level = await owner.db
      .from("stock_levels")
      .update({ quantity_on_hand: 100 })
      .eq("product_id", productId);
    expect(insert.error?.code).toBe("42501");
    expect(level.error?.code).toBe("42501");
  });

  it("cannot be changed or deleted afterwards", async () => {
    const { data: movement } = await owner.db
      .from("stock_movements")
      .select("id")
      .limit(1)
      .single();
    const update = await owner.db
      .from("stock_movements")
      .update({ quantity: 999 })
      .eq("id", movement!.id);
    const remove = await owner.db
      .from("stock_movements")
      .delete()
      .eq("id", movement!.id);
    expect(update.error?.code).toBe("42501");
    expect(remove.error?.code).toBe("42501");
  });

  it("hides every cost from stock staff", async () => {
    const tables = [
      "stock_costs",
      "stock_movement_costs",
      "supplier_invoice_totals",
      "supplier_invoice_line_costs",
    ] as const;
    for (const table of tables) {
      const { data, error } = await staff.db.from(table).select("*").limit(5);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data: deliveries } = await staff.db
      .from("delivery_overview")
      .select("gross_total")
      .limit(20);
    expect(deliveries?.every((d) => d.gross_total === null)).toBe(true);
  });
});

describe("deliveries", () => {
  let invoiceId: string;
  let lineId: string;
  const invoiceNumber = `DBTEST-${Date.now()}`;

  it("stock staff can start one, add a product and check it in", async () => {
    const created = await staff.db.rpc("create_delivery", {
      p_supplier_id: supplierId,
      p_delivered_at: new Date(Date.now() - 60_000).toISOString(),
      p_notes: "Database test delivery",
    });
    expect(created.error).toBeNull();
    invoiceId = created.data!;

    const line = await staff.db.rpc("add_delivery_line", {
      p_invoice_id: invoiceId,
      p_product_id: productId,
      p_cases: 2,
      p_units_per_case: UNITS_PER_CASE,
    });
    expect(line.error).toBeNull();
    lineId = line.data!;

    const checkIn = await staff.db.rpc("check_in_delivery", {
      p_invoice_id: invoiceId,
    });
    expect(checkIn.error).toBeNull();
  });

  it("viewers cannot record one", async () => {
    const { error } = await viewer.db.rpc("create_delivery", {
      p_supplier_id: supplierId,
      p_delivered_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
  });

  it("stock staff cannot enter costs or post", async () => {
    const costs = await staff.db.rpc("save_delivery_costs", {
      p_invoice_id: invoiceId,
      p_net_total: 9,
    });
    const post = await staff.db.rpc("post_delivery", {
      p_invoice_id: invoiceId,
    });
    expect(costs.error?.code).toBe("42501");
    expect(post.error?.code).toBe("42501");
  });

  it("cannot be posted until the invoice adds up", async () => {
    const before = await manager.db.rpc("delivery_problems", {
      p_invoice_id: invoiceId,
    });
    expect(before.data).toEqual(
      expect.arrayContaining([
        "Enter the invoice number.",
        "Enter the case cost for 1 line(s).",
      ]),
    );

    const saved = await manager.db.rpc("save_delivery_costs", {
      p_invoice_id: invoiceId,
      p_invoice_number: invoiceNumber,
      p_invoice_date: new Date().toISOString().slice(0, 10),
      p_net_total: 10,
      p_vat_total: 2,
      p_gross_total: 12,
      p_lines: [{ line_id: lineId, case_cost: CASE_COST, vat_rate_pct: 20 }],
    });
    expect(saved.error).toBeNull();

    const post = await manager.db.rpc("post_delivery", {
      p_invoice_id: invoiceId,
    });
    expect(post.error?.message).toContain(
      "The lines add up to £9.00 before VAT, but the invoice says £10.00.",
    );
    expect(await onHand()).toBe(startingStock);
  });

  it("adds the stock and sets the average cost when posted", async () => {
    await manager.db.rpc("save_delivery_costs", {
      p_invoice_id: invoiceId,
      p_invoice_number: invoiceNumber,
      p_invoice_date: new Date().toISOString().slice(0, 10),
      p_net_total: 9,
      p_vat_total: 1.8,
      p_gross_total: 10.8,
      p_lines: [{ line_id: lineId, case_cost: CASE_COST, vat_rate_pct: 20 }],
    });
    const post = await manager.db.rpc("post_delivery", {
      p_invoice_id: invoiceId,
    });
    expect(post.error).toBeNull();
    expect(await onHand()).toBe(startingStock + 2 * UNITS_PER_CASE);

    const { data: cost } = await manager.db
      .from("stock_costs")
      .select("average_unit_cost, last_unit_cost")
      .eq("product_id", productId)
      .single();
    expect(Number(cost?.last_unit_cost)).toBe(CASE_COST / UNITS_PER_CASE);
    expect(Number(cost?.average_unit_cost)).toBe(CASE_COST / UNITS_PER_CASE);

    const { data: history } = await manager.db
      .from("supplier_cost_history")
      .select("case_cost")
      .eq("invoice_line_id", lineId);
    expect(history).toHaveLength(1);
  });

  it("cannot be posted twice", async () => {
    const { error } = await manager.db.rpc("post_delivery", {
      p_invoice_id: invoiceId,
    });
    expect(error?.message).toContain("This delivery is posted.");
    expect(await onHand()).toBe(startingStock + 2 * UNITS_PER_CASE);
  });

  it("refuses the same invoice number twice for one supplier", async () => {
    const { data: second } = await staff.db.rpc("create_delivery", {
      p_supplier_id: supplierId,
      p_delivered_at: new Date(Date.now() - 60_000).toISOString(),
      p_notes: "Database test delivery (duplicate number)",
    });
    const { error } = await manager.db.rpc("save_delivery_costs", {
      p_invoice_id: second!,
      p_invoice_number: invoiceNumber.toLowerCase(),
    });
    expect(error?.code).toBe("23505");
    const voided = await owner.db.rpc("void_delivery", {
      p_invoice_id: second!,
      p_reason: "Database test",
    });
    expect(voided.error).toBeNull();
  });

  it("only owners can void, and voiding takes the stock back off", async () => {
    const byManager = await manager.db.rpc("void_delivery", {
      p_invoice_id: invoiceId,
      p_reason: "Database test",
    });
    expect(byManager.error?.code).toBe("42501");

    const byOwner = await owner.db.rpc("void_delivery", {
      p_invoice_id: invoiceId,
      p_reason: "Database test",
    });
    expect(byOwner.error).toBeNull();
    expect(await onHand()).toBe(startingStock);

    const { data: history } = await owner.db
      .from("supplier_cost_history")
      .select("id")
      .eq("invoice_line_id", lineId);
    expect(history).toEqual([]);
  });
});

describe("adjustments", () => {
  let limit: number;
  let waste: string;
  let found: string;

  beforeAll(async () => {
    const { data } = await owner.db
      .from("settings")
      .select("value")
      .eq("key", "adjustment_approval_units")
      .single();
    limit = Number(data?.value ?? 20);
    [waste, found] = await Promise.all([reasonId("Waste"), reasonId("Found")]);
  });

  it("must move stock the way the reason says", async () => {
    const { error } = await staff.db.rpc("request_adjustment", {
      p_product_id: productId,
      p_quantity: 1,
      p_reason_id: waste,
    });
    expect(error?.message).toContain("takes stock away");
  });

  it("go straight through for staff below the limit", async () => {
    const { data, error } = await staff.db.rpc("request_adjustment", {
      p_product_id: productId,
      p_quantity: -1,
      p_reason_id: waste,
      p_note: "Database test",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "auto_approved" });
    expect(await onHand()).toBe(startingStock - 1);
  });

  it("wait for a manager above the limit, and a rejection changes nothing", async () => {
    const { data } = await staff.db.rpc("request_adjustment", {
      p_product_id: productId,
      p_quantity: -(limit + 1),
      p_reason_id: waste,
      p_note: "Database test",
    });
    const request = data as { id: string; status: string };
    expect(request.status).toBe("pending");
    expect(await onHand()).toBe(startingStock - 1);

    const byStaff = await staff.db.rpc("decide_adjustment", {
      p_adjustment_id: request.id,
      p_approve: true,
    });
    expect(byStaff.error?.code).toBe("42501");

    const rejected = await manager.db.rpc("decide_adjustment", {
      p_adjustment_id: request.id,
      p_approve: false,
    });
    expect(rejected.error).toBeNull();
    expect(await onHand()).toBe(startingStock - 1);
  });

  it("change the stock once a manager approves", async () => {
    const { data } = await staff.db.rpc("request_adjustment", {
      p_product_id: productId,
      p_quantity: -(limit + 1),
      p_reason_id: waste,
      p_note: "Database test",
    });
    const request = data as { id: string; status: string };
    const approved = await manager.db.rpc("decide_adjustment", {
      p_adjustment_id: request.id,
      p_approve: true,
    });
    expect(approved.error).toBeNull();
    expect(await onHand()).toBe(startingStock - 1 - (limit + 1));
  });

  it("never need approval for managers (and this puts the stock back)", async () => {
    const { data, error } = await manager.db.rpc("request_adjustment", {
      p_product_id: productId,
      p_quantity: limit + 2,
      p_reason_id: found,
      p_note: "Database test: undo",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "auto_approved" });
    expect(await onHand()).toBe(startingStock);
  });
});

describe("opening stock", () => {
  const row = (quantity: number) => ({
    row_number: 2,
    product_code: TEST_BARCODE,
    quantity,
    unit_cost: null,
  });

  it("stock staff cannot set it", async () => {
    const { error } = await staff.db.rpc("import_opening_stock", {
      p_rows: [row(5)],
      p_as_of: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
  });

  it("a manager's preview saves nothing", async () => {
    const { data, error } = await manager.db.rpc("import_opening_stock", {
      p_rows: [row(startingStock + 5)],
      p_as_of: new Date().toISOString(),
      p_dry_run: true,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ valid: 1, products_set: 1, errors: [] });
    expect(await onHand()).toBe(startingStock);
  });
});

describe("afterwards", () => {
  it("every stock level still matches its movements", async () => {
    const { data, error } = await owner.db.rpc("stock_ledger_mismatches");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
