// Fills the DEVELOPMENT database with demo accounts and the fictional sample
// data: products, suppliers, the opening stock count, four weeks of
// deliveries and till sales, two deliveries still in progress, a count
// waiting for review and one still being counted. It uses
// the same database functions as the app, signed in as the demo users. Safe
// to run again: anything already there is left alone.
//
//   npm run db:seed-dev -- --confirm-dev
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY and DEMO_PASSWORD in .env.local.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";

import { autoMatchColumns, IMPORT_FIELDS } from "../src/lib/imports/fields";
import {
  buildOpeningStockRows,
  buildProductRows,
  buildSalesRows,
  buildSupplierProductRows,
  toSheetTable,
} from "../src/lib/imports/rows";
import { londonLocalToDate } from "../src/lib/london-time";
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

// Deliveries still in progress, found again by their note so a second run
// does not add them twice. The posted ones come from sample-data/deliveries.csv.
const DEMO_DELIVERIES = [
  {
    note: "Demo delivery: waiting to post",
    supplier: "Valley Foods Ltd",
    deliveredAt: "2026-10-26T06:10:00Z",
    stage: "checked_in",
  },
  {
    note: "Demo delivery: being checked in",
    supplier: "Hearthstone Bakery Ltd",
    deliveredAt: "2026-10-27T05:50:00Z",
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
  await seedSampleDeliveries(manager);
  await seedSales(owner);
  await seedDeliveries(staff, manager);
  await seedCounts(staff, manager);
  await owner.rpc("refresh_alerts");

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

/** Runs `task` over `items`, a few at a time. */
async function inBatches<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task));
  }
}

/**
 * The four weeks of deliveries in sample-data/deliveries.csv, entered and
 * posted by the manager exactly as in the app.
 */
async function seedSampleDeliveries(manager: Client) {
  const { table } = readSample("deliveries.csv");
  const col = (name: string) => table.headers.indexOf(name);
  const cell = (cells: unknown[], name: string) =>
    String(cells[col(name)] ?? "").trim();

  const invoices = new Map<
    string,
    {
      supplier: string;
      deliveredAt: string;
      invoiceNumber: string;
      lines: { code: string; cases: number; caseCost: number; vat: string }[];
    }
  >();
  for (const row of table.rows) {
    const number = cell(row.cells, "Invoice Number");
    const invoice = invoices.get(number) ?? {
      supplier: cell(row.cells, "Supplier"),
      deliveredAt: cell(row.cells, "Delivered At"),
      invoiceNumber: number,
      lines: [],
    };
    invoice.lines.push({
      code: cell(row.cells, "Supplier Code"),
      cases: Number(cell(row.cells, "Cases")),
      caseCost: Number(cell(row.cells, "Case Cost Ex VAT")),
      vat: cell(row.cells, "VAT Code"),
    });
    invoices.set(number, invoice);
  }

  const [
    { data: existing },
    { data: suppliers },
    { data: links },
    { data: vat },
  ] = await Promise.all([
    manager
      .from("supplier_invoices")
      .select("notes")
      .like("notes", "Sample delivery %")
      .neq("status", "void"),
    manager.from("suppliers").select("id, name"),
    manager
      .from("supplier_products")
      .select("supplier_id, supplier_code, product_id, units_per_case")
      .limit(5000),
    manager.from("vat_rates").select("code, rate_pct"),
  ]);
  const done = new Set(existing?.map((i) => i.notes));
  const supplierId = new Map(suppliers?.map((s) => [s.name, s.id]));
  const link = new Map(
    links?.map((l) => [`${l.supplier_id}:${l.supplier_code}`, l]),
  );
  const vatRate = new Map(vat?.map((v) => [v.code, Number(v.rate_pct)]));

  const todo = [...invoices.values()].filter(
    (invoice) => !done.has(`Sample delivery ${invoice.invoiceNumber}`),
  );
  if (todo.length === 0) {
    console.log(`  sample deliveries: all ${invoices.size} already posted`);
    return;
  }
  console.log(`  posting ${todo.length} sample deliveries…`);

  await inBatches(todo, 6, async (invoice) => {
    const supplier = supplierId.get(invoice.supplier);
    const deliveredAt = londonLocalToDate(
      invoice.deliveredAt.replace(" ", "T"),
    );
    if (!supplier || !deliveredAt) {
      throw new Error(`Sample delivery ${invoice.invoiceNumber} is not valid.`);
    }
    const { data: invoiceId, error: createError } = await manager.rpc(
      "create_delivery",
      {
        p_supplier_id: supplier,
        p_delivered_at: deliveredAt.toISOString(),
        p_notes: `Sample delivery ${invoice.invoiceNumber}`,
      },
    );
    if (createError) throw createError;

    let netPence = 0;
    let vatPence = 0;
    const costs: {
      line_id: string;
      case_cost: number;
      vat_rate_pct: number;
    }[] = [];
    for (const line of invoice.lines) {
      const item = link.get(`${supplier}:${line.code}`);
      if (!item) {
        throw new Error(
          `${invoice.supplier} has no product code ${line.code}.`,
        );
      }
      const { data: lineId, error } = await manager.rpc("add_delivery_line", {
        p_invoice_id: invoiceId,
        p_product_id: item.product_id,
        p_cases: line.cases,
        p_units_per_case: item.units_per_case,
      });
      if (error) throw error;
      const rate = vatRate.get(line.vat) ?? 0;
      const linePence = Math.round(line.caseCost * line.cases * 100);
      netPence += linePence;
      vatPence += Math.round((linePence * rate) / 100);
      costs.push({
        line_id: lineId,
        case_cost: line.caseCost,
        vat_rate_pct: rate,
      });
    }

    const steps = [
      () => manager.rpc("check_in_delivery", { p_invoice_id: invoiceId }),
      () =>
        manager.rpc("save_delivery_costs", {
          p_invoice_id: invoiceId,
          p_invoice_number: invoice.invoiceNumber,
          p_invoice_date: invoice.deliveredAt.slice(0, 10),
          p_net_total: netPence / 100,
          p_vat_total: vatPence / 100,
          p_gross_total: (netPence + vatPence) / 100,
          p_lines: costs,
        }),
      () => manager.rpc("post_delivery", { p_invoice_id: invoiceId }),
    ];
    for (const step of steps) {
      const { error } = await step();
      if (error) throw error;
    }
  });
  console.log(`  sample deliveries: ${todo.length} posted`);
}

/** The daily till sales files, oldest first, imported by the owner. */
async function seedSales(owner: Client) {
  const files = readdirSync(new URL("../sample-data/sales/", import.meta.url))
    .filter((name) => name.endsWith(".csv"))
    .sort();
  const { data: imported } = await owner
    .from("imports")
    .select("file_fingerprint")
    .eq("import_type", "sales")
    .eq("status", "committed");
  const done = new Set(imported?.map((i) => i.file_fingerprint));

  let count = 0;
  let unmatched = 0;
  for (const name of files) {
    const file = readSample(`sales/${name}`);
    if (done.has(file.fingerprint)) continue;
    const mapping = autoMatchColumns(file.table.headers, IMPORT_FIELDS.sales);
    const built = buildSalesRows(file.table, mapping);
    if (built.errors.length) {
      throw new Error(
        `${name} has problems: ${JSON.stringify(built.errors.slice(0, 3))}`,
      );
    }
    const headers = Object.fromEntries(
      Object.entries(mapping)
        .filter((entry): entry is [string, number] => entry[1] != null)
        .map(([field, index]) => [field, file.table.headers[index]]),
    );
    const { data, error } = await owner.rpc("import_sales", {
      p_rows: built.rows,
      p_file_name: name,
      p_fingerprint: file.fingerprint,
      p_mapping: mapping,
      p_rows_skipped: 0,
      p_column_headers: headers,
      p_dry_run: false,
    });
    if (error) throw new Error(`${name}: ${error.message}`);
    count++;
    unmatched += Number((data as { unmatched?: number }).unmatched ?? 0);
  }
  console.log(
    count
      ? `  sales: ${count} days imported, ${unmatched} unmatched lines to match`
      : `  sales: all ${files.length} days already imported`,
  );
}

/** Staff start the in-progress demo deliveries; one is checked in. */
async function seedDeliveries(staff: Client, manager: Client) {
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
      .select("product_id, units_per_case, product:products!inner(active)")
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

    for (const [index, item] of items.entries()) {
      const { error } = await staff.rpc("add_delivery_line", {
        p_invoice_id: invoiceId,
        p_product_id: item.product_id,
        p_cases: (index % 3) + 1,
        p_units_per_case: item.units_per_case,
      });
      if (error) throw error;
    }

    if (demo.stage === "checked_in") {
      const { error } = await staff.rpc("check_in_delivery", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
    }
    console.log(`  ${demo.note}: ${items.length} products`);
  }
}

/**
 * A finished count of Milk & Cream for the manager to review (as of the
 * evening the sample sales end, so it can be approved), with a few small
 * differences and one big enough to suggest a recount; and a spot check of
 * the bakery that staff are still counting.
 */
async function seedCounts(staff: Client, manager: Client) {
  const { data: existing } = await manager
    .from("stock_counts")
    .select("name")
    .in("name", ["Demo: Milk & Cream count", "Demo: bakery spot check"])
    .neq("status", "cancelled");
  const done = new Set(existing?.map((c) => c.name));

  const productsIn = async (category: string) => {
    const { data: cat } = await manager
      .from("categories")
      .select("id")
      .eq("name", category)
      .single();
    const { data: products } = await manager
      .from("products")
      .select("id, name, stock:stock_levels(quantity_on_hand)")
      .eq("category_id", cat!.id)
      .eq("active", true)
      .order("name");
    return { categoryId: cat!.id, products: products ?? [] };
  };

  if (!done.has("Demo: Milk & Cream count")) {
    const { categoryId, products } = await productsIn("Milk & Cream");
    const { data: countId, error } = await manager.rpc("create_count", {
      p_name: "Demo: Milk & Cream count",
      p_scope: "category",
      p_category_id: categoryId,
      // 22:30 UK time on 22 Oct 2026, after the last sample day's trading.
      p_as_of: "2026-10-22T21:30:00Z",
    });
    if (error) throw error;
    // Mostly right, a few off by one or two, one off by a lot.
    const differences = [0, -2, 0, 1, 0, -1, 24, 0];
    for (const [index, product] of products.entries()) {
      const onHand = Number(product.stock[0]?.quantity_on_hand ?? 0);
      const counted = Math.max(
        0,
        onHand + differences[index % differences.length],
      );
      const shelf = Math.ceil(counted / 2);
      for (const [location, quantity] of [
        ["Chiller", shelf],
        ["Stockroom", counted - shelf],
      ] as const) {
        const { error: lineError } = await staff.rpc("add_count_line", {
          p_count_id: countId,
          p_product_id: product.id,
          p_counted_qty: quantity,
          p_location: location,
        });
        if (lineError) throw lineError;
      }
    }
    const { error: submitError } = await staff.rpc("submit_count", {
      p_count_id: countId,
    });
    if (submitError) throw submitError;
    console.log(
      `  Demo: Milk & Cream count: ${products.length} products, waiting for review`,
    );
  }

  if (!done.has("Demo: bakery spot check")) {
    const { products } = await productsIn("Bread & Rolls");
    const { data: countId, error } = await manager.rpc("create_count", {
      p_name: "Demo: bakery spot check",
      p_scope: "spot",
      p_as_of: new Date().toISOString(),
    });
    if (error) throw error;
    for (const product of products.slice(0, 3)) {
      const { error: lineError } = await staff.rpc("add_count_line", {
        p_count_id: countId,
        p_product_id: product.id,
        p_counted_qty: Number(product.stock[0]?.quantity_on_hand ?? 0),
        p_location: "Shelf",
      });
      if (lineError) throw lineError;
    }
    console.log("  Demo: bakery spot check: 3 products counted so far");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
