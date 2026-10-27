// Phase 2 in the browser: deliveries, waste and approvals, opening stock.
// Every change is undone (a void, or an adjustment the other way), so the
// demo stock ends where it started.

import { expect, type Page, test } from "@playwright/test";

import { requirePassword, signIn, snap, switchUser } from "./helpers";

// Brookmere Dairy Semi-Skimmed Milk 2L: Fresh Dairy code FD-1001, 8 to a case.
const MILK_BARCODE = "5061311000016";
const MILK_SUPPLIER_CODE = "FD-1001";
const MILK_CASE_COST = "11.05";

test.beforeAll(requirePassword);

/** Finds the milk on the waste page and returns how much is in stock. */
async function chooseMilk(page: Page): Promise<number> {
  await page.getByLabel("Find a product").fill(MILK_BARCODE);
  await page.getByLabel("Find a product").press("Enter");
  const line = page.getByText(/in stock$/);
  await expect(line).toBeVisible();
  const match = (await line.textContent())?.match(/([−\d,.]+) in stock$/);
  return Number(match?.[1].replace(/,/g, "").replace("−", "-"));
}

test("a delivery is checked in by staff, posted by a manager and voided by the owner", async ({
  page,
}) => {
  const invoiceNumber = `E2E-${Date.now()}`;

  // Staff: start the delivery, scan the supplier code, finish the check-in.
  await signIn(page, "staff@example.com");
  await page.goto("/deliveries/new");
  await page
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: "Fresh Dairy Ltd" });
  await page.getByLabel("Notes").fill("Browser test delivery");
  await page.getByRole("button", { name: "Start checking it in" }).click();
  await expect(page).toHaveURL(/\/deliveries\/[0-9a-f-]{36}$/);
  const deliveryUrl = page.url();

  await page.getByLabel("Cases", { exact: true }).fill("2");
  await page.getByLabel("Find a product").fill(MILK_SUPPLIER_CODE);
  await page.getByLabel("Find a product").press("Enter");
  await expect(page.getByText("Added 2 × Semi-Skimmed Milk")).toBeVisible();
  await expect(page.getByText("1 lines · 16 units and kg")).toBeVisible();
  await snap(page, "delivery-check-in");

  await page.getByRole("button", { name: "Finish check-in" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Finish check-in" })
    .click();
  await expect(
    page
      .getByText("Checked in. A manager will enter the costs and post it.")
      .first(),
  ).toBeVisible();
  await expect(page.getByLabel("Invoice number")).toHaveCount(0);

  // Manager: enter the paperwork and post.
  await switchUser(page, "manager@example.com");
  await page.goto(deliveryUrl);
  await page.getByLabel("Invoice number").fill(invoiceNumber);
  await page
    .getByLabel("Date on the invoice")
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Case cost for Semi-Skimmed Milk").fill(MILK_CASE_COST);
  await page.getByLabel("Total before VAT (£)").fill("22.10");
  await page.getByLabel("VAT (£)", { exact: true }).fill("0");
  await page.getByLabel("Total (£)", { exact: true }).fill("22.10");
  await snap(page, "delivery-costs");
  await page.getByRole("button", { name: "Save and post" }).click();
  await expect(
    page.getByText("Posted. 16 units and kg recorded in stock."),
  ).toBeVisible();
  await expect(page.getByText(/^Posted .* by Demo Manager/)).toBeVisible();

  // Owner: void it, which takes the 16 back out.
  await switchUser(page, "owner@example.com");
  await page.goto(deliveryUrl);
  await page.getByLabel("Why is it being voided?").fill("Browser test");
  await page.getByRole("button", { name: "Void this delivery" }).click();
  await expect(
    page.getByText("Voided. Any stock it added has been taken back out."),
  ).toBeVisible();
  await snap(page, "delivery-void");
});

test("small waste goes straight through; big waste waits for a manager", async ({
  page,
}) => {
  const note = `Browser test ${Date.now()}`;

  await signIn(page, "staff@example.com");
  await page.goto("/adjustments");
  const before = await chooseMilk(page);
  await page.getByLabel("Reason").selectOption({ label: "Waste" });
  await page.getByLabel("How many").fill("1");
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(
    page.getByText(
      "Recorded: 1 × Semi-Skimmed Milk taken out of stock (waste).",
    ),
  ).toBeVisible();
  expect(await chooseMilk(page)).toBe(before - 1);

  await page.getByLabel("Reason").selectOption({ label: "Waste" });
  await page.getByLabel("How many").fill("25");
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(
    page.getByText(/is over the limit, so a manager needs to approve it/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await snap(page, "waste-pending");

  // Manager: approve it, then put all 26 back so the demo stock is unchanged.
  await switchUser(page, "manager@example.com");
  await page.goto("/adjustments");
  await page
    .getByRole("row", { name: new RegExp(note) })
    .getByRole("button", { name: "Approve" })
    .click();
  await expect(
    page.getByText("Approved. Stock has been updated."),
  ).toBeVisible();
  expect(await chooseMilk(page)).toBe(before - 26);

  await page.getByLabel("Reason").selectOption({ label: "Found" });
  await page.getByLabel("How many").fill("26");
  await page.getByLabel("Note").fill(`${note}: undo`);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(
    page.getByText("Recorded: 26 × Semi-Skimmed Milk added to stock (found)."),
  ).toBeVisible();
  expect(await chooseMilk(page)).toBe(before);
});

test("opening stock cannot be loaded twice", async ({ page }) => {
  await signIn(page, "manager@example.com");
  await page.goto("/imports/new?kind=opening_stock");
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("When was the stock counted?")).toBeVisible();
  await page
    .getByLabel("Spreadsheet")
    .setInputFiles("sample-data/opening-stock.csv");
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("3. Check the preview")).toBeVisible();
  await expect(
    page
      .getByText(
        "This product already has opening stock. Correct it with an adjustment.",
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nothing to import" }),
  ).toBeDisabled();
  await snap(page, "opening-stock-preview");
});

test("the stock pages hide costs from stock staff", async ({ page }) => {
  await signIn(page, "staff@example.com");
  await page.goto("/stock");
  await expect(
    page.getByRole("columnheader", { name: "On hand" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Value" })).toHaveCount(
    0,
  );
  await expect(page.getByText(/Stock value/)).toHaveCount(0);
  await snap(page, "stock-as-staff");

  await page.goto("/deliveries?show=all");
  await expect(page.getByRole("columnheader", { name: "Total" })).toHaveCount(
    0,
  );
  await page.goto("/imports/new?kind=opening_stock");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL("/no-access");
});
