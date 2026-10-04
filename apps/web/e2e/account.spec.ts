/**
 * Account page (J-6, FR-3, NFR-7): rename, add an email with a code, then delete the account
 * after the preview and typed confirmation; every session for it is gone afterwards.
 */
import { expect, test } from "@playwright/test";
import { startTrip } from "./helpers";

test("account: name, email, delete", async ({ page }, info) => {
  const isPhone = info.project.name === "phone";
  const phone = isPhone ? "202-555-0177" : "202-555-0167";
  await startTrip(page, { phone, name: "Dana", trip: "Dana solo" });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByText(/•••• \d{4}/)).toBeVisible();

  await page.getByLabel("Your name").fill("Dana B");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(isPhone ? "dana.phone@example.com" : "dana.desk@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code we emailed/).fill("000000");
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page.getByText("Email confirmed.")).toBeVisible();

  await page.getByRole("link", { name: /Delete my account/ }).click();
  await expect(page.getByRole("heading", { name: "Delete your account?" })).toBeVisible();
  await expect(page.getByText("Dana solo")).toBeVisible();
  await expect(page.getByText(/You're the only one on it, so the trip is deleted/)).toBeVisible();
  const del = page.getByRole("button", { name: "Delete my account" });
  await expect(del).toBeDisabled();
  await page.getByLabel(/to confirm/).fill("delete");
  await del.click();
  await expect(page).toHaveURL(/account=deleted/, { timeout: 30_000 });

  // Signed out everywhere: the app sends you to sign in.
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/signin/);
});
