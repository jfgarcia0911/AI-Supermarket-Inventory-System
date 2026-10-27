import { expect, type Page, test } from "@playwright/test";

export const password = process.env.DEMO_PASSWORD ?? "";

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

/** Signs out by forgetting the session, then signs in as someone else. */
export async function switchUser(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
}

export async function snap(page: Page, name: string) {
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: true,
  });
}

export function requirePassword() {
  if (!password)
    throw new Error(
      "Set DEMO_PASSWORD in .env.local and run npm run db:seed-dev.",
    );
}
