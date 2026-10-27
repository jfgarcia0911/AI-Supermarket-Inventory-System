// Fills the DEVELOPMENT database with demo accounts, the fictional sample data
// and a few demo deliveries, using the same database functions as the app
// (signed in as the demo users). Safe to run again: existing accounts are
// kept, re-importing the same data changes nothing, and opening stock and
// deliveries that are already there are left alone.
//
//   npm run db:seed-dev -- --confirm-dev
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY and DEMO_PASSWORD in .env.local.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";

import { autoMatchColumns, IMPORT_FIELDS } from "../src/lib/imports/fields";
import {
  buildOpeningStockRows,
  buildProductRows,
  buildSupplierProductRows,
  toSheetTable,
} from "../src/lib/imports/rows";
import type { Database } from "../src/lib/supabase/database.types";

const DEMO_USERS = [
  { email: "owner@example.com", full_name: "Demo Owner", role: "owner" },
  { email: "manager@example.com", full_name: "Demo Manager", role: "manager" },
  { email: "staff@example.com", full_name: "Demo Staff", role: "staff" },
  { email: "viewer@example.com", full_name: "Demo Viewer", role: "viewer" },
] as const;

// The sample stock-take: the evening of 24 Sep 2026 (22:30 BST), the night
// before the sample sales start.
const OPENING_STOCK_AS_OF = "2026-09-24T21:30:00Z";

// Found again by their note, so a second run does not add them twice.
const DEMO_DELIVERIES = [
  {
    note: "Demo delivery: posted",
    supplier: "Fresh Dairy Ltd",
    deliveredAt: "2026-09-25T05:45:00Z",
    invoiceNumber: "FD-250925",
    stage: "posted",
  },
  {
    note: "Demo delivery: waiting to post",
    supplier: "Valley Foods Ltd",
    deliveredAt: "2026-10-26T06:10:00Z",
    invoiceNumber: null,
    stage: "checked_in",
  },
  {
    note: "Demo delivery: being checked in",
    supplier: "Hearthstone Bakery Ltd",
    deliveredAt: "2026-10-27T05:50:00Z",
    invoiceNumber: null,
    stage: "draft",
  },
] as const;

type Client = SupabaseClient<Database>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in .env.local`);
  }
  return value;
}

function readSample(file: string) {
  const text = readFileSync(
    new URL(`../sample-data/${file}`, import.meta.url),
    "utf8",
  );
  return {
    table: toSheetTable(Papa.parse<string[]>(text).data),
    fingerprint: createHash("sha256").update(text).digest("hex"),
  };
}

async function main() {
  if (!process.argv.includes("--confirm-dev")) {
    throw new Error(
      "This writes demo data. Run it only against the development database, with --confirm-dev.",
    );
  }
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const password = env("DEMO_PASSWORD");
  console.log(`Seeding ${url}`);

  const admin = createClient<Database>(url, env("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Demo accounts (one per role), ready to use without a password change.
  const { data: existing } = await admin.from("profiles").select("id, email");
  for (const user of DEMO_USERS) {
    let id = existing?.find((p) => p.email === user.email)?.id;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: user.full_name },
        app_metadata: { role: user.role, must_change_password: false },
      });
      if (error) throw error;
      id = data.user.id;
      console.log(`  created ${user.email} (${user.role})`);
    } else {
      await admin.auth.admin.updateUserById(id, {
        password,
        ban_duration: "none",
      });
    }
    await admin
      .from("profiles")
      .update({
        role: user.role,
        active: true,
        must_change_password: false,
        full_name: user.full_name,
      })
      .eq("id", id);
  }

  // 2. Everything else as the demo users, through Row Level Security.
  const signIn = async (email: string): Promise<Client> => {
    const client = createClient<Database>(
      url,
      env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return client;
  };
  const owner = await signIn("owner@example.com");

  // Suppliers.
  const suppliers = readSample("suppliers.csv").table;
  const col = (name: string) => suppliers.headers.indexOf(name);
  for (const row of suppliers.rows) {
    const cell = (name: string) =>
      String(row.cells[col(name)] ?? "").trim() || null;
    const name = cell("Supplier Name") as string;
    const { data: found } = await owner
      .from("suppliers")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    if (!found) {
      const { error } = await owner.from("suppliers").insert({
        name,
        account_number: cell("Account Number"),
        phone: cell("Phone"),
        email: cell("Email"),
        payment_terms_days: Number(cell("Payment Terms Days")),
        delivery_days: cell("Delivery Days"),
        lead_time_days: Number(cell("Lead Time Days")),
      });
      if (error) throw error;
      console.log(`  added supplier ${name}`);
    }
  }

  // Products.
  const products = readSample("products.csv");
  const productMapping = autoMatchColumns(
    products.table.headers,
    IMPORT_FIELDS.products,
  );
  const productRows = buildProductRows(products.table, productMapping);
  if (productRows.errors.length) {
    throw new Error(
      `Sample products have problems: ${JSON.stringify(productRows.errors.slice(0, 3))}`,
    );
  }
  const { data: productResult, error: productError } = await owner.rpc(
    "import_products",
    {
      p_rows: productRows.rows,
      p_file_name: "products.csv",
      p_fingerprint: products.fingerprint,
      p_mapping: productMapping,
      p_dry_run: false,
    },
  );
  if (productError) throw productError;
  console.log("  products:", productResult);

  // Supplier price lists, one supplier at a time.
  const priceList = readSample("supplier-products.csv");
  const priceMapping = autoMatchColumns(
    priceList.table.headers,
    IMPORT_FIELDS.supplier_products,
  );
  const { data: supplierRows } = await owner
    .from("suppliers")
    .select("id, name")
    .order("name");
  for (const supplier of supplierRows ?? []) {
    const built = buildSupplierProductRows(
      priceList.table,
      priceMapping,
      supplier.name,
    );
    if (built.rows.length === 0) continue;
    const { data, error } = await owner.rpc("import_supplier_products", {
      p_supplier_id: supplier.id,
      p_rows: built.rows,
      p_file_name: "supplier-products.csv",
      p_fingerprint: priceList.fingerprint,
      p_mapping: priceMapping,
      p_dry_run: false,
    });
    if (error) throw error;
    console.log(`  ${supplier.name}:`, data);
  }

  await seedOpeningStock(owner);

  const staff = await signIn("staff@example.com");
  const manager = await signIn("manager@example.com");
  await seedDeliveries(staff, manager);

  await Promise.all(
    [owner, staff, manager].map((client) => client.auth.signOut()),
  );
  console.log(
    "Done. Sign in as owner@example.com with DEMO_PASSWORD from .env.local.",
  );
}

async function seedOpeningStock(owner: Client) {
  const { count } = await owner
    .from("stock_levels")
    .select("product_id", { count: "exact", head: true })
    .not("last_counted_at", "is", null);
  if (count) {
    console.log(`  opening stock: already set for ${count} products`);
    return;
  }
  const opening = readSample("opening-stock.csv");
  const mapping = autoMatchColumns(
    opening.table.headers,
    IMPORT_FIELDS.opening_stock,
  );
  const built = buildOpeningStockRows(opening.table, mapping);
  if (built.errors.length) {
    throw new Error(
      `Sample opening stock has problems: ${JSON.stringify(built.errors.slice(0, 3))}`,
    );
  }
  const { data, error } = await owner.rpc("import_opening_stock", {
    p_rows: built.rows,
    p_as_of: OPENING_STOCK_AS_OF,
    p_file_name: "opening-stock.csv",
    p_fingerprint: opening.fingerprint,
    p_mapping: mapping,
    p_rows_skipped: 0,
    p_dry_run: false,
  });
  if (error) throw error;
  console.log("  opening stock:", data);
}

/** Staff start and check in each delivery; the manager enters costs and posts. */
async function seedDeliveries(staff: Client, manager: Client) {
  const { data: vatRates } = await manager
    .from("vat_rates")
    .select("code, rate_pct");
  const vatRate = new Map(vatRates?.map((v) => [v.code, v.rate_pct]));

  for (const demo of DEMO_DELIVERIES) {
    const { data: existing } = await manager
      .from("supplier_invoices")
      .select("id")
      .eq("notes", demo.note)
      .neq("status", "void")
      .limit(1);
    if (existing?.length) {
      console.log(`  ${demo.note}: already there`);
      continue;
    }

    const { data: supplier, error: supplierError } = await manager
      .from("suppliers")
      .select("id")
      .eq("name", demo.supplier)
      .single();
    if (supplierError) throw supplierError;
    const { data: items, error: itemsError } = await manager
      .from("supplier_products")
      .select(
        "id, product_id, units_per_case, product:products!inner(vat_code, active)",
      )
      .eq("supplier_id", supplier.id)
      .eq("is_preferred", true)
      .eq("active", true)
      .eq("product.active", true)
      .order("supplier_code")
      .limit(demo.stage === "draft" ? 3 : 6);
    if (itemsError) throw itemsError;

    const { data: invoiceId, error: createError } = await staff.rpc(
      "create_delivery",
      {
        p_supplier_id: supplier.id,
        p_delivered_at: demo.deliveredAt,
        p_notes: demo.note,
      },
    );
    if (createError) throw createError;

    const lines: { lineId: string; cases: number; itemIndex: number }[] = [];
    for (const [index, item] of items.entries()) {
      const cases = (index % 3) + 1;
      const { data: lineId, error } = await staff.rpc("add_delivery_line", {
        p_invoice_id: invoiceId,
        p_product_id: item.product_id,
        p_cases: cases,
        p_units_per_case: item.units_per_case,
      });
      if (error) throw error;
      lines.push({ lineId, cases, itemIndex: index });
    }

    if (demo.stage !== "draft") {
      const { error } = await staff.rpc("check_in_delivery", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
    }

    if (demo.stage === "posted") {
      const { data: costs, error: costsError } = await manager
        .from("supplier_product_latest_costs")
        .select("supplier_product_id, case_cost")
        .in(
          "supplier_product_id",
          items.map((item) => item.id),
        );
      if (costsError) throw costsError;
      const caseCost = new Map(
        costs.map((c) => [c.supplier_product_id, Number(c.case_cost)]),
      );

      // Work in pence, so the totals add up exactly like a printed invoice.
      let netPence = 0;
      let vatPence = 0;
      const costLines = lines.map(({ lineId, cases, itemIndex }) => {
        const item = items[itemIndex];
        const cost = caseCost.get(item.id) ?? 0;
        const rate = vatRate.get(item.product.vat_code) ?? 0;
        const linePence = Math.round(cost * cases * 100);
        netPence += linePence;
        vatPence += Math.round((linePence * rate) / 100);
        return { line_id: lineId, case_cost: cost, vat_rate_pct: rate };
      });

      const { error: saveError } = await manager.rpc("save_delivery_costs", {
        p_invoice_id: invoiceId,
        p_invoice_number: demo.invoiceNumber,
        p_invoice_date: demo.deliveredAt.slice(0, 10),
        p_net_total: netPence / 100,
        p_vat_total: vatPence / 100,
        p_gross_total: (netPence + vatPence) / 100,
        p_lines: costLines,
      });
      if (saveError) throw saveError;
      const { error: postError } = await manager.rpc("post_delivery", {
        p_invoice_id: invoiceId,
      });
      if (postError) throw postError;
    }
    console.log(`  ${demo.note}: ${lines.length} products`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
