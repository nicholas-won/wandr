import { expect, test } from "@playwright/test";

test("landing page converts: hero, CTAs, FAQ (desktop and phone)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("actually decides");
  await expect(page.getByRole("link", { name: /Start a trip, free/ }).first()).toBeVisible();
  await page.getByText("Do my friends need to download an app?").click();
  await expect(page.getByText(/view and vote right away/)).toBeVisible();
});
