// Proves the counting rules hold in the database itself: who may start,
// count, review and approve; that a count is checked against the stock
// expected at its moment; that approval waits for the sales; and that
// approving writes the correction dated at the count's moment.
//
// Counts use their own switched-off test product, counted "as of" a day in
// August 2026, before the sample data starts, so no other test is affected.
// The approved correction is put back with an adjustment afterwards.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  COUNT_TEST_BARCODE,
  type SignedIn,
  signInAll,
  useTestProduct,
} from "./helpers";

const AS_OF = "2026-08-01T21:30:00+00:00";

let owner: SignedIn;
let manager: SignedIn;
let staff: SignedIn;
let viewer: SignedIn;
let productId: string;
let onHand: () => Promise<number>;
let switchOff: () => Promise<void>;
let startingStock: number;
let countId: string;
const openCounts: string[] = [];

async function newCount(name: string, asOf = AS_OF): Promise<string> {
  const { data, error } = await manager.db.rpc("create_count", {
    p_name: `Database test: ${name}`,
    p_scope: "spot",
    p_as_of: asOf,
  });
  if (error) throw error;
  openCounts.push(data);
  return data;
}

beforeAll(async () => {
  ({ owner, manager, staff, viewer } = await signInAll());
  ({ productId, onHand, switchOff } = await useTestProduct(
    owner,
    COUNT_TEST_BARCODE,
    "Database count test product",
  ));
  startingStock = await onHand();
});

afterAll(async () => {
  if (!manager) return;
  for (const id of openCounts) {
    await manager.db.rpc("cancel_count", { p_count_id: id });
  }
  await switchOff?.();
});

describe("starting and counting", () => {
  it("only owners and managers start counts", async () => {
    const { error } = await staff.db.rpc("create_count", {
      p_name: "Database test: by staff",
      p_scope: "spot",
      p_as_of: AS_OF,
    });
    expect(error?.code).toBe("42501");
    countId = await newCount("spot check");
  });

  it("stock staff count; viewers cannot", async () => {
    const byViewer = await viewer.db.rpc("add_count_line", {
      p_count_id: countId,
      p_product_id: productId,
      p_counted_qty: 1,
    });
    expect(byViewer.error?.code).toBe("42501");

    for (const [location, quantity] of [
      ["Shelf", 3],
      ["Stockroom", 2],
    ] as const) {
      const { error } = await staff.db.rpc("add_count_line", {
        p_count_id: countId,
        p_product_id: productId,
        p_counted_qty: quantity,
        p_location: location,
      });
      expect(error).toBeNull();
    }
  });

  it("is blind for stock staff: they cannot see the expected stock", async () => {
    const review = await staff.db.rpc("count_review", { p_count_id: countId });
    expect(review.error?.code).toBe("42501");
    const results = await staff.db
      .from("stock_count_results")
      .select("id")
      .limit(1);
    expect(results.data).toEqual([]);
  });

  it("cannot be approved before counting is finished, or by staff", async () => {
    const early = await manager.db.rpc("approve_count", {
      p_count_id: countId,
    });
    expect(early.error?.message).toContain("has been finished");
    const { error } = await staff.db.rpc("submit_count", {
      p_count_id: countId,
    });
    expect(error).toBeNull();
    const byStaff = await staff.db.rpc("approve_count", {
      p_count_id: countId,
    });
    expect(byStaff.error?.code).toBe("42501");
  });

  it("cannot be changed once finished", async () => {
    const { error } = await staff.db.rpc("add_count_line", {
      p_count_id: countId,
      p_product_id: productId,
      p_counted_qty: 1,
    });
    expect(error?.message).toContain("can no longer be changed");
  });
});

describe("reviewing", () => {
  let expected: number;

  it("compares the count with the stock expected at its moment", async () => {
    const { data, error } = await manager.db.rpc("count_review", {
      p_count_id: countId,
    });
    expect(error).toBeNull();
    const row = data?.find((r) => r.product_id === productId);
    expect(row).toMatchObject({ counted_total: 5, line_count: 2 });
    expected = Number(row?.expected_qty);
    expect(Number(row?.variance_qty)).toBe(5 - expected);
  });

  it("can send products back to be counted again", async () => {
    const { data, error } = await manager.db.rpc("request_recounts", {
      p_count_id: countId,
      p_product_ids: [productId],
    });
    expect(error).toBeNull();
    expect(data).toBe(1);
    const { data: count } = await manager.db
      .from("stock_counts")
      .select("status")
      .eq("id", countId)
      .single();
    expect(count?.status).toBe("in_progress");
    const { data: lines } = await manager.db
      .from("stock_count_lines")
      .select("id")
      .eq("count_id", countId);
    expect(lines).toEqual([]);

    await staff.db.rpc("add_count_line", {
      p_count_id: countId,
      p_product_id: productId,
      p_counted_qty: 6,
    });
    await staff.db.rpc("submit_count", { p_count_id: countId });
  });

  it("approving corrects the stock, dated at the count's moment", async () => {
    const { data, error } = await manager.db.rpc("approve_count", {
      p_count_id: countId,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ products: 1 });
    const difference = 6 - expected;
    expect(await onHand()).toBe(startingStock + difference);

    const { data: result } = await manager.db
      .from("stock_count_results")
      .select(
        "counted_total, expected_qty, variance_qty, movement:stock_movements(movement_type, quantity, occurred_at)",
      )
      .eq("count_id", countId)
      .single();
    expect(result).toMatchObject({
      counted_total: 6,
      expected_qty: expected,
      variance_qty: difference,
    });
    if (difference !== 0) {
      expect(result?.movement).toMatchObject({
        quantity: difference,
        occurred_at: AS_OF,
      });
      expect(["opening_balance", "count_correction"]).toContain(
        result?.movement?.movement_type,
      );
    }
    const { data: level } = await owner.db
      .from("stock_levels")
      .select("last_counted_at")
      .eq("product_id", productId)
      .single();
    expect(level?.last_counted_at).toBe(AS_OF);

    // Put the stock back as it was.
    if (difference !== 0) {
      const { data: reason } = await manager.db
        .from("adjustment_reasons")
        .select("id")
        .eq("name", "Correction")
        .single();
      const { error: undoError } = await manager.db.rpc("request_adjustment", {
        p_product_id: productId,
        p_quantity: -difference,
        p_reason_id: reason!.id,
        p_note: "Database test: undo count",
      });
      expect(undoError).toBeNull();
    }
    expect(await onHand()).toBe(startingStock);
  });
});

describe("approval waits", () => {
  it("until the count's moment has passed", async () => {
    const tomorrow = new Date(Date.now() + 864e5).toISOString();
    const id = await newCount("tomorrow", tomorrow);
    await staff.db.rpc("add_count_line", {
      p_count_id: id,
      p_product_id: productId,
      p_counted_qty: 1,
    });
    await staff.db.rpc("submit_count", { p_count_id: id });
    const { error } = await manager.db.rpc("approve_count", { p_count_id: id });
    expect(error?.message).toContain("has not happened yet");
  });

  it("until every day's sales up to the count are imported", async (context) => {
    const { data: coverage } = await manager.db.rpc("sales_coverage");
    if (!(coverage as { missing_count: number }).missing_count) {
      context.skip(); // Every day is imported, so there is nothing to wait for.
    }
    const id = await newCount(
      "today",
      new Date(Date.now() - 60_000).toISOString(),
    );
    await staff.db.rpc("add_count_line", {
      p_count_id: id,
      p_product_id: productId,
      p_counted_qty: 1,
    });
    await staff.db.rpc("submit_count", { p_count_id: id });
    const { error } = await manager.db.rpc("approve_count", { p_count_id: id });
    expect(error?.message).toContain("Import the sales for");
    expect(await onHand()).toBe(startingStock);
  });

  it("and only owners and managers can cancel a count", async () => {
    const id = openCounts.at(-1)!;
    const byStaff = await staff.db.rpc("cancel_count", { p_count_id: id });
    expect(byStaff.error?.code).toBe("42501");
    const byManager = await manager.db.rpc("cancel_count", { p_count_id: id });
    expect(byManager.error).toBeNull();
  });
});

describe("alerts", () => {
  it("are worked out on request, and stock staff see only theirs", async () => {
    const refreshed = await staff.db.rpc("refresh_alerts");
    expect(refreshed.error).toBeNull();
    const { data } = await staff.db.from("alerts").select("type").limit(1000);
    const allowed = [
      "low_stock",
      "negative_stock",
      "unposted_delivery",
      "unknown_barcode",
    ];
    expect(data?.every((a) => allowed.includes(a.type))).toBe(true);
  });

  it("include an unknown barcode staff report, which managers can close", async () => {
    const code = `99${Date.now()}`;
    const reported = await staff.db.rpc("report_unknown_barcode", {
      p_code: code,
    });
    expect(reported.error).toBeNull();
    const { data: alert } = await manager.db
      .from("alerts")
      .select("id, status, severity")
      .eq("type", "unknown_barcode")
      .eq("subject", code)
      .single();
    expect(alert).toMatchObject({ status: "open", severity: "warning" });

    const byStaff = await staff.db.rpc("resolve_alert", {
      p_alert_id: alert!.id,
    });
    expect(byStaff.error?.code).toBe("42501");
    const byViewer = await viewer.db.rpc("acknowledge_alert", {
      p_alert_id: alert!.id,
    });
    expect(byViewer.error?.code).toBe("42501");

    expect(
      (await staff.db.rpc("acknowledge_alert", { p_alert_id: alert!.id }))
        .error,
    ).toBeNull();
    expect(
      (await manager.db.rpc("resolve_alert", { p_alert_id: alert!.id })).error,
    ).toBeNull();
  });

  it("stay acknowledged while the problem is still there", async () => {
    await owner.db.rpc("refresh_alerts");
    const { data: open } = await owner.db
      .from("alerts")
      .select("id")
      .eq("status", "open")
      .eq("type", "low_stock")
      .limit(1)
      .maybeSingle();
    if (!open) return; // Nothing low on stock right now.
    await owner.db.rpc("acknowledge_alert", { p_alert_id: open.id });
    await owner.db.rpc("refresh_alerts");
    const { data: after } = await owner.db
      .from("alerts")
      .select("status")
      .eq("id", open.id)
      .single();
    expect(after?.status).toBe("acknowledged");
  });
});

describe("reports", () => {
  it("are not for stock staff", async () => {
    const { error } = await staff.db.rpc("report_stock_by_department");
    expect(error?.code).toBe("42501");
  });

  it("value the stock the same way as the dashboard", async () => {
    const [{ data: departments }, { data: summary }] = await Promise.all([
      viewer.db.rpc("report_stock_by_department"),
      viewer.db.rpc("stock_summary"),
    ]);
    const total = (departments ?? []).reduce(
      (sum, d) => sum + Number(d.value ?? 0),
      0,
    );
    expect(total).toBeCloseTo(
      Number((summary as { stock_value: number }).stock_value),
      0,
    );
  });

  it("add up: opening + movements = closing for every product", async () => {
    const { data, error } = await manager.db
      .rpc("report_movement_products", {
        p_from: "2026-10-01",
        p_to: "2026-10-22",
      })
      .range(0, 999);
    expect(error).toBeNull();
    for (const row of data ?? []) {
      const sum =
        Number(row.opening) +
        Number(row.received) +
        Number(row.sold) +
        Number(row.adjusted) +
        Number(row.counted) +
        Number(row.reversed);
      expect(sum, row.product_name).toBeCloseTo(Number(row.closing), 3);
    }
  });
});

describe("afterwards", () => {
  it("a switched-off product's old count does not make days 'missing'", async () => {
    // This product was first counted in August, long before the shop started.
    await switchOff();
    const { data } = await manager.db.rpc("sales_coverage");
    expect((data as { needed_from: string | null }).needed_from).not.toBe(
      "2026-08-02",
    );
    await owner.db
      .from("products")
      .update({ active: true })
      .eq("id", productId);
  });

  it("every stock level still matches its movements", async () => {
    const { data, error } = await owner.db.rpc("stock_ledger_mismatches");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
