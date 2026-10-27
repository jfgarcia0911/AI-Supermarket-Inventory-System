// Phase 4 in the browser: scanning, counting, alerts, reports and the
// installable app. Nothing here changes stock: the count is cancelled, and
// the reported barcode's alert is closed.

import { expect, test } from "@playwright/test";

import { requirePassword, signIn, snap, switchUser } from "./helpers";

const MILK_BARCODE = "5061311000016";

test.beforeAll(requirePassword);

test("scanning shows the product card, and staff can report an unknown barcode", async ({
  page,
}) => {
  const unknown = `20${Date.now()}`.slice(0, 13);

  await signIn(page, "staff@example.com");
  await page.goto("/scan");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Find a product").fill(MILK_BARCODE);
  await page.getByLabel("Find a product").press("Enter");
  await expect(page.getByText("In stock (estimated)")).toBeVisible();
  await expect(page.getByText(/Semi-Skimmed Milk/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "History" })).toBeVisible();
  await snap(page, "scan-card");

  await page.getByLabel("Find a product").fill(unknown);
  await page.getByLabel("Find a product").press("Enter");
  await expect(page.getByText(`No product has ${unknown}`)).toBeVisible();
  await page.getByRole("button", { name: "Tell a manager" }).click();
  await expect(
    page.getByText("A manager will see it in Alerts."),
  ).toBeVisible();

  // The manager sees it in Alerts and closes it.
  await switchUser(page, "manager@example.com");
  await page.goto("/alerts?type=unknown_barcode");
  const alert = page.getByRole("listitem").filter({ hasText: unknown });
  await expect(alert).toBeVisible();
  await snap(page, "alerts");
  await alert.getByRole("button", { name: "Close" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Close alert" })
    .click();
  await expect(page.getByText("Alert closed.")).toBeVisible();
});

test("the camera scanner opens, and explains when it cannot start", async ({
  page,
}) => {
  await signIn(page, "staff@example.com");
  await page.goto("/scan");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Scan with the camera" }).click();
  await expect(page.getByLabel("Camera view")).toBeAttached();
  // The test browser has no camera, so a plain-English message appears.
  await expect(
    page.getByText(/camera|barcode inside the box/i).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close the camera" }).first().click();
  await expect(page.getByLabel("Camera view")).toHaveCount(0);
});

test("a manager starts a count, staff count on a phone, and the manager reviews it", async ({
  page,
}) => {
  const name = `Browser test count ${Date.now()}`;

  await signIn(page, "manager@example.com");
  await page.goto("/counts/new");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: /Spot check/ }).check();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Start the count" }).click();
  await expect(page).toHaveURL(/\/counts\/[0-9a-f-]{36}$/);
  const countUrl = page.url();

  await switchUser(page, "staff@example.com");
  await page.goto(countUrl);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Counting in").selectOption("Stockroom");
  await page.getByLabel("Find a product").fill(MILK_BARCODE);
  await page.getByLabel("Find a product").press("Enter");
  await page.getByLabel("How many").fill("5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText("Semi-Skimmed Milk: Counted 5 (Stockroom)."),
  ).toBeVisible();
  await expect(page.getByText(/1 line · 1 product/)).toBeVisible();
  await snap(page, "count-counting");

  await page.getByRole("button", { name: "Finish counting" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Finish counting" })
    .click();
  await expect(
    page.getByText("Counting is finished. A manager will review it."),
  ).toBeVisible();
  // Counting is blind: staff never see the expected stock.
  await expect(page.getByText("Expected")).toHaveCount(0);

  await switchUser(page, "manager@example.com");
  await page.goto(countUrl);
  await expect(
    page.getByRole("columnheader", { name: "Expected" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Semi-Skimmed Milk/ }),
  ).toBeVisible();
  await snap(page, "count-review");
  await page.getByRole("button", { name: "Cancel count" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel count" })
    .click();
  await expect(
    page.getByText("Count cancelled. Stock has not changed."),
  ).toBeVisible();
});

test("reports show the figures and download for Excel", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/reports");
  await page.getByRole("link", { name: /Stock on hand and value/ }).click();
  await expect(page.getByRole("cell", { name: "Total" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Value" })).toBeVisible();
  await snap(page, "report-stock");

  const csv = await page.request.get("/reports/export?report=stock");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(
    "Department,Category,Product,Size,Sold by",
  );

  await page.goto("/reports/movements?from=2026-10-01&to=2026-10-22");
  await expect(
    page.getByRole("cell", { name: "Sale", exact: true }),
  ).toBeVisible();
  const movements = await page.request.get(
    "/reports/export?report=movements&from=2026-10-01&to=2026-10-22",
  );
  expect(await movements.text()).toContain("Stock at start (2026-10-01)");
});

test("stock staff cannot open reports", async ({ page }) => {
  await signIn(page, "staff@example.com");
  await page.goto("/reports");
  await expect(page).toHaveURL("/no-access");
  const csv = await page.request.get("/reports/export?report=stock");
  expect(csv.status()).toBe(403);
});

test("the app can be installed: its manifest, icons and scanner load without signing in", async ({
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({
    name: "AI Supermarket Inventory",
    display: "standalone",
  });
  expect((await request.get("/icons/icon-512.png")).ok()).toBe(true);
  const scanner = await request.get("/scanner/zxing_reader.wasm");
  expect(scanner.ok()).toBe(true);
});

test("on a phone, staff get big task buttons and a bottom bar", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone layout only");
  await signIn(page, "staff@example.com");
  await expect(
    page.getByRole("link", { name: "Scan a product" }),
  ).toBeVisible();
  const bar = page.getByRole("navigation", { name: "Main" });
  await bar.getByRole("link", { name: "Counts" }).click();
  await expect(page.getByRole("heading", { name: "Counts" })).toBeVisible();
  await bar.getByRole("button", { name: "More" }).click();
  await expect(
    page.getByRole("link", { name: "Waste & adjustments" }),
  ).toBeVisible();
  await snap(page, "phone-more");
});
