import { expect, type Page } from "@playwright/test";

/**
 * D74: sign up with a phone number (dev code 000000, never accepted in production). The code
 * step submits itself at 6 digits; the name step only appears for new numbers.
 */
export async function signUp(page: Page, phone: string, name: string) {
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByText(/Test mode/)).toBeVisible();
  await page.getByLabel("6-digit code").fill("000000");
  const nameField = page.getByLabel("Your name");
  await expect(nameField.or(page.getByRole("navigation", { name: "App" }))).toBeVisible({ timeout: 30_000 });
  if (await nameField.isVisible()) {
    await nameField.fill(name);
    await page.getByRole("button", { name: "Done" }).click();
  }
  await expect(page).not.toHaveURL(/\/signin/, { timeout: 30_000 });
}

/** Website → sign up → /start → a trip with one destination. */
export async function startTrip(page: Page, opts: { phone: string; name: string; trip: string; city?: string }) {
  await page.goto("/");
  await page.getByRole("link", { name: /Start planning/ }).first().click();
  await signUp(page, opts.phone, opts.name);
  await expect(page).toHaveURL(/\/start/);
  const form = page.locator("form").filter({ has: page.locator('input[name="destinations"]') });
  await form.locator('input[name="destinations"]').fill(opts.city ?? "Lisbon");
  await form.locator('input[name="name"]').fill(opts.trip);
  await form.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByRole("heading", { name: opts.trip }).first()).toBeVisible({ timeout: 30_000 });
}
