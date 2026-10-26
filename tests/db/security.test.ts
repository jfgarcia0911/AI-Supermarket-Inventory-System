// Proves the database itself enforces who may see and change what, whatever
// the app does. Runs against the development database as the demo accounts.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { withCheckDigit } from "@/lib/barcodes";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const password = process.env.DEMO_PASSWORD ?? "";

function client(): Client {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string): Promise<{ db: Client; id: string }> {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error)
    throw new Error(
      `${email}: ${error.message}. Run npm run db:seed-dev first.`,
    );
  return { db, id: data.user.id };
}

// A barcode no real or sample product uses.
const UNUSED_BARCODE = withCheckDigit("509999912345");

const dryRunRow = {
  row_number: 2,
  category: "Test department > Dry run",
  name: "Dry-run test product",
  brand: null,
  size: null,
  sold_by: null,
  vat_code: "S",
  sell_price: 1.5,
  barcode: UNUSED_BARCODE,
  case_barcode: null,
  case_units: null,
  till_code: null,
  reorder_point: null,
  reorder_qty: null,
};

const FINGERPRINT = "0".repeat(64);

let anon: Client;
let owner: { db: Client; id: string };
let manager: { db: Client; id: string };
let staff: { db: Client; id: string };
let viewer: { db: Client; id: string };
let someProductId: string;

beforeAll(async () => {
  if (!url || !key || !password) {
    throw new Error(
      "Set the Supabase variables and DEMO_PASSWORD in .env.local.",
    );
  }
  anon = client();
  [owner, manager, staff, viewer] = await Promise.all([
    signIn("owner@example.com"),
    signIn("manager@example.com"),
    signIn("staff@example.com"),
    signIn("viewer@example.com"),
  ]);
  const { data } = await owner.db
    .from("products")
    .select("id")
    .limit(1)
    .single();
  someProductId = data!.id;
});

describe("signed-out visitors", () => {
  it("cannot read products", async () => {
    const { error } = await anon.from("products").select("id").limit(1);
    expect(error?.code).toBe("42501");
  });

  it("cannot run imports", async () => {
    const { error } = await anon.rpc("import_products", {
      p_rows: [dryRunRow],
      p_file_name: "test.csv",
      p_fingerprint: FINGERPRINT,
    });
    expect(error).not.toBeNull();
  });
});

describe("stock staff", () => {
  it("can look up products and barcodes", async () => {
    const products = await staff.db.from("products").select("id").limit(5);
    const barcodes = await staff.db
      .from("product_barcodes")
      .select("barcode")
      .limit(5);
    expect(products.data?.length).toBeGreaterThan(0);
    expect(barcodes.data?.length).toBeGreaterThan(0);
  });

  it("cannot see any cost prices", async () => {
    const history = await staff.db
      .from("supplier_cost_history")
      .select("id")
      .limit(5);
    const latest = await staff.db
      .from("supplier_product_latest_costs")
      .select("unit_cost")
      .limit(5);
    expect(history.error).toBeNull();
    expect(history.data).toEqual([]);
    expect(latest.data).toEqual([]);
  });

  it("cannot change products", async () => {
    const { data } = await staff.db
      .from("products")
      .update({ name: "Changed by staff" })
      .eq("id", someProductId)
      .select("id");
    expect(data).toEqual([]);
    const { data: product } = await owner.db
      .from("products")
      .select("name")
      .eq("id", someProductId)
      .single();
    expect(product?.name).not.toBe("Changed by staff");
  });

  it("cannot add products", async () => {
    const { data: category } = await staff.db
      .from("categories")
      .select("id")
      .limit(1)
      .single();
    const { error } = await staff.db.from("products").insert({
      name: "Added by staff",
      category_id: category!.id,
      vat_code: "S",
    });
    expect(error?.code).toBe("42501");
  });

  it("cannot preview an import", async () => {
    const { error } = await staff.db.rpc("import_products", {
      p_rows: [dryRunRow],
      p_file_name: "test.csv",
      p_fingerprint: FINGERPRINT,
    });
    expect(error?.code).toBe("42501");
  });

  it("cannot read the audit log", async () => {
    const { data } = await staff.db.from("audit_log").select("id").limit(5);
    expect(data).toEqual([]);
  });

  it("cannot make themselves an owner", async () => {
    const direct = await staff.db
      .from("profiles")
      .update({ role: "owner" })
      .eq("id", staff.id)
      .select("id");
    expect(direct.data ?? []).toEqual([]);
    const viaFunction = await staff.db.rpc("set_user_role", {
      p_user_id: staff.id,
      p_role: "owner",
    });
    expect(viaFunction.error?.code).toBe("42501");
    const { data: profile } = await owner.db
      .from("profiles")
      .select("role")
      .eq("id", staff.id)
      .single();
    expect(profile?.role).toBe("staff");
  });
});

describe("viewers", () => {
  it("can read cost prices", async () => {
    const { data } = await viewer.db
      .from("supplier_cost_history")
      .select("id")
      .limit(5);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("cannot change suppliers", async () => {
    const { data: supplier } = await viewer.db
      .from("suppliers")
      .select("id, name")
      .limit(1)
      .single();
    const { data } = await viewer.db
      .from("suppliers")
      .update({ name: "Changed by viewer" })
      .eq("id", supplier!.id)
      .select("id");
    expect(data).toEqual([]);
  });
});

describe("managers", () => {
  it("can preview an import, and the preview saves nothing", async () => {
    const { data, error } = await manager.db.rpc("import_products", {
      p_rows: [dryRunRow],
      p_file_name: "test.csv",
      p_fingerprint: FINGERPRINT,
      p_dry_run: true,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      new_products: 1,
      new_categories: 2,
      errors: [],
    });

    const { data: saved } = await manager.db
      .from("product_barcodes")
      .select("id")
      .eq("barcode", UNUSED_BARCODE);
    expect(saved).toEqual([]);
  });

  it("get a clear message for each bad row in a preview", async () => {
    const { data } = await manager.db.rpc("import_products", {
      p_rows: [{ ...dryRunRow, vat_code: "X" }],
      p_file_name: "test.csv",
      p_fingerprint: FINGERPRINT,
    });
    expect(data).toMatchObject({
      valid: 0,
      errors: [
        { row: 2, message: "The VAT code must be Z (0%), R (5%) or S (20%)." },
      ],
    });
  });

  it("cannot save a barcode with a wrong check digit", async () => {
    const wrong =
      UNUSED_BARCODE.slice(0, -1) + ((Number(UNUSED_BARCODE.at(-1)) + 1) % 10);
    const { error } = await manager.db
      .from("product_barcodes")
      .insert({ product_id: someProductId, barcode: wrong });
    expect(error?.code).toBe("23514");
  });

  it("cannot manage users", async () => {
    const { error } = await manager.db.rpc("set_user_role", {
      p_user_id: staff.id,
      p_role: "manager",
    });
    expect(error?.code).toBe("42501");
  });
});

describe("owners", () => {
  it("can read the audit log", async () => {
    const { data } = await owner.db.from("audit_log").select("id").limit(5);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("cannot switch off or demote themselves", async () => {
    const off = await owner.db.rpc("set_user_active", {
      p_user_id: owner.id,
      p_active: false,
    });
    const demote = await owner.db.rpc("set_user_role", {
      p_user_id: owner.id,
      p_role: "staff",
    });
    expect(off.error?.message).toMatch(/cannot switch off your own account/);
    expect(demote.error?.message).toMatch(/cannot change your own role/);
  });
});
