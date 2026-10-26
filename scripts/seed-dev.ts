// Fills the DEVELOPMENT database with demo accounts and the fictional sample
// data, using the same import functions as the app (signed in as the demo
// owner). Safe to run again: existing accounts are kept and re-importing the
// same data changes nothing.
//
//   npm run db:seed-dev -- --confirm-dev
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY and DEMO_PASSWORD in .env.local.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

import { autoMatchColumns, IMPORT_FIELDS } from "../src/lib/imports/fields";
import {
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

  // 2. Everything else as the demo owner, through Row Level Security.
  const owner = createClient<Database>(
    url,
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { error: signInError } = await owner.auth.signInWithPassword({
    email: "owner@example.com",
    password,
  });
  if (signInError) throw signInError;

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

  await owner.auth.signOut();
  console.log(
    "Done. Sign in as owner@example.com with DEMO_PASSWORD from .env.local.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
