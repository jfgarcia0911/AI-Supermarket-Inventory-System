// Phase 3 in the browser: importing the till's sales, the Sales pages and the
// unmatched-codes list. The one real import (a small generated file for the
// switched-off test product, on a day before the sample data) is reversed by
// the owner, and again in clean-up if a test stops half way.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { password, requirePassword, signIn, snap, switchUser } from "./helpers";

// The "Database test product" (see tests/db/helpers.ts).
const TEST_BARCODE = "5099999000011";

test.beforeAll(requirePassword);

test.afterAll(async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
  await db.auth.signInWithPassword({ email: "owner@example.com", password });
  const { data } = await db
    .from("imports")
    .select("id")
    .like("file_name", "e2e-sales-%")
    .eq("status", "committed");
  for (const row of data ?? []) {
    await db.rpc("reverse_sales_import", {
      p_import_id: row.id,
      p_reason: "Browser test clean-up",
    });
  }
});

test("a sales file that was already imported cannot be imported again", async ({
  page,
}) => {
  await signIn(page, "manager@example.com");
  await page.goto("/imports/new?kind=sales");
  // Choosing a file before the page is interactive is lost.
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Spreadsheet")
    .setInputFiles("sample-data/sales/sales_2026-10-15.csv");
  await expect(page.getByText("2. Match the columns")).toBeVisible();
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("3. Check the preview")).toBeVisible();
  await expect(
    page.getByText(/This file was already imported on/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cannot import this file" }),
  ).toBeDisabled();
  await snap(page, "sales-import-blocked");
});

test("a manager imports a day's sales and the owner reverses it", async ({
  page,
}) => {
  const csv = [
    "Date,Item Code,Description,Qty Sold,Gross Sales",
    `03/09/2026,${TEST_BARCODE},BROWSER TEST ITEM,2,3.00`,
    `03/09/2026,E2E${Date.now()},UNKNOWN TILL LINE,1,1.00`,
  ].join("\r\n");

  await signIn(page, "manager@example.com");
  await page.goto("/imports/new?kind=sales");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Spreadsheet").setInputFiles({
    name: `e2e-sales-${Date.now()}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("2. Match the columns")).toBeVisible();
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("Sales for 3 Sept 2026")).toBeVisible();
  await snap(page, "sales-import-preview");
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText("Import finished")).toBeVisible();
  await expect(
    page.getByText(/1 lines came off stock, 1 unmatched lines were kept/),
  ).toBeVisible();
  await page.getByRole("link", { name: "View this import" }).click();
  await expect(
    page.getByRole("heading", { name: /Sales for 3 Sept 2026/ }),
  ).toBeVisible();
  const importUrl = page.url();
  await expect(page.getByText("UNKNOWN TILL LINE")).toBeVisible();

  await switchUser(page, "owner@example.com");
  await page.goto(importUrl);
  await page.getByLabel("Why is it being reversed?").fill("Browser test");
  await page.getByRole("button", { name: "Reverse this import" }).click();
  await expect(
    page.getByText(/Reversed: 1 stock changes undone/),
  ).toBeVisible();
  await expect(page.getByText("Reversed", { exact: true })).toBeVisible();
  await snap(page, "sales-import-reversed");
});

test("the Sales pages show missing days, imports and unmatched codes", async ({
  page,
}) => {
  await signIn(page, "owner@example.com");
  await expect(page.getByText(/Sales not imported for/)).toBeVisible();

  await page.goto("/sales");
  await expect(page.getByText(/Sales missing for \d+ days?/)).toBeVisible();
  await snap(page, "sales");
  await page.getByRole("link", { name: "22 Oct 2026", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sales for 22 Oct 2026" }),
  ).toBeVisible();
  await page.getByLabel("Show").selectOption("unmatched");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("CARRIER BAG 10P")).toBeVisible();

  await page.goto("/sales/unmatched");
  const protein = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "PROTEIN BAR CHOCOLATE 45G" });
  await protein.getByRole("button", { name: "Match to a product" }).click();
  await protein.getByLabel("Find a product").fill("5061311000016");
  await protein.getByLabel("Find a product").press("Enter");
  await expect(
    protein.getByRole("button", { name: /^Match \d+ lines$/ }),
  ).toBeVisible();
  await expect(
    protein.getByText("is added to the product's barcodes"),
  ).toBeVisible();
  await snap(page, "sales-unmatched");
  // Leave the demo data as it is.
  await protein.getByRole("button", { name: "Cancel" }).click();
  await expect(
    protein.getByRole("button", { name: "Match to a product" }),
  ).toBeVisible();
});

test("stock staff cannot see sales", async ({ page }) => {
  await signIn(page, "staff@example.com");
  await expect(page.getByRole("link", { name: "Sales" })).toHaveCount(0);
  await page.goto("/sales");
  await expect(page).toHaveURL("/no-access");
});
