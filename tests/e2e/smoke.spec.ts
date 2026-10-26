import { expect, type Page, test } from "@playwright/test";

const password = process.env.DEMO_PASSWORD ?? "";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function snap(page: Page, name: string) {
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: true,
  });
}

test.beforeAll(() => {
  if (!password)
    throw new Error(
      "Set DEMO_PASSWORD in .env.local and run npm run db:seed-dev.",
    );
});

test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
  await page.goto("/products");
  await expect(page).toHaveURL(/\/login\?next=%2Fproducts/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await snap(page, "login");
});

test("a wrong password is refused with a clear message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("That email and password do not match an account."),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("owner@example.com");
});

test("the owner can browse products, costs and users", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await expect(
    page.getByRole("heading", { name: "Hello, Demo" }),
  ).toBeVisible();
  await expect(page.getByText("Missing a selling price")).toBeVisible();
  await snap(page, "dashboard");

  await page.goto("/products?q=semi-skimmed");
  await expect(page.getByText(/Showing 1–\d+ of \d+/)).toBeVisible();
  await snap(page, "products");

  await page.getByRole("link", { name: "Semi-Skimmed Milk" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Semi-Skimmed Milk" }),
  ).toBeVisible();
  await expect(page.getByText("Fresh Dairy Ltd")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Margin" }),
  ).toBeVisible();
  await snap(page, "product");

  await page.goto("/suppliers");
  await page.getByRole("link", { name: "Central Wholesale Ltd" }).click();
  await expect(
    page.getByRole("heading", { name: "Central Wholesale Ltd" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Case cost" }),
  ).toBeVisible();
  await snap(page, "supplier");

  await page.goto("/categories");
  await expect(page.getByRole("cell", { name: /Milk & Cream/ })).toBeVisible();
  await snap(page, "categories");

  await page.goto("/settings/users");
  await expect(page.getByText("staff@example.com")).toBeVisible();
  await snap(page, "users");
});

test("previewing an import saves nothing", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/imports/new?kind=products");
  await page
    .getByLabel("Spreadsheet")
    .setInputFiles("sample-data/products.csv");
  await expect(page.getByText("2. Match the columns")).toBeVisible();
  await snap(page, "import-columns");

  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("3. Check the preview")).toBeVisible();
  await expect(page.getByText("Already up to date")).toBeVisible();
  // The sample data is already imported, so there is nothing to do.
  await expect(
    page.getByRole("button", { name: "Nothing to import" }),
  ).toBeDisabled();
  await snap(page, "import-preview");
  await page.getByRole("button", { name: "Back to columns" }).click();
  await expect(page.getByText("2. Match the columns")).toBeVisible();
});

test("a file with problems shows a clear message for each bad row", async ({
  page,
}) => {
  await signIn(page, "manager@example.com");
  await page.goto("/imports/new?kind=products");
  await page
    .getByLabel("Spreadsheet")
    .setInputFiles("tests/e2e/fixtures/products-with-problems.csv");
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(
    page.getByText("4 rows have problems and will be skipped"),
  ).toBeVisible();
  await expect(page.getByText("The product name is missing.")).toBeVisible();
  await expect(
    page.getByText('VAT "17.5" is not Z (0%), R (5%) or S (20%).'),
  ).toBeVisible();
  await expect(page.getByText(/was shortened by Excel/)).toBeVisible();
  await expect(
    page.getByText("Each row needs a barcode or a till code."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 1 rows and skip 4" }),
  ).toBeEnabled();
  await snap(page, "import-problems");
});

test("a manager can edit a product, and the change is saved", async ({
  page,
}) => {
  await signIn(page, "manager@example.com");
  await page.goto("/products?q=semi-skimmed");
  await page.getByRole("link", { name: "Semi-Skimmed Milk" }).first().click();
  await page.getByRole("link", { name: "Edit" }).click();

  const reorderPoint = page.getByLabel("Reorder point");
  const original = await reorderPoint.inputValue();
  await reorderPoint.fill("999");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("999", { exact: true })).toBeVisible();

  // Put it back as it was.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Reorder point").fill(original);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Semi-Skimmed Milk" }),
  ).toBeVisible();
});

test("a category with products cannot be switched off", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/categories");
  await page
    .getByRole("row", { name: /Milk & Cream/ })
    .getByRole("link", { name: "Edit" })
    .click();
  await page.getByRole("checkbox", { name: "Active" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/still has \d+ active products/)).toBeVisible();
});

test("stock staff see no costs and no settings", async ({ page }) => {
  await signIn(page, "staff@example.com");
  await page.goto("/products?q=semi-skimmed");
  await page.getByRole("link", { name: "Semi-Skimmed Milk" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Semi-Skimmed Milk" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Margin" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await snap(page, "product-as-staff");

  await page.goto("/settings");
  await expect(page).toHaveURL("/no-access");
  await page.goto("/imports");
  await expect(page).toHaveURL("/no-access");
});
