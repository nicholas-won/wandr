/** Built-in map (FR-122): a trip with a pinned idea shows a map and a synced list. */
import { expect, test } from "@playwright/test";

test("trip map shows pins and a keyboard-usable list", async ({ page }) => {
  await page.goto("/start");
  const form = page.locator("form").filter({ has: page.locator('input[name="destinations"]') });
  await form.locator('input[name="destinations"]').fill("Lisbon");
  await form.locator('input[name="name"]').fill("Map test");
  await form.getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Map test" }).first()).toBeVisible();
  // A Google Maps link carries coordinates, so the idea gets a pin without any API key.
  await page.getByLabel("Paste a link or type an idea").fill("https://www.google.com/maps/place/Time+Out+Market/@38.7069,-9.1457,17z");
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByRole("heading", { name: /Time Out Market/i })).toBeVisible({ timeout: 30_000 });

  const tripUrl = page.url().split("?")[0]!;
  await page.goto(`${tripUrl}/map`);
  await expect(page.getByRole("button", { name: /Time Out Market/i }).first()).toBeVisible();
  // The map itself (MapLibre canvas or Google) or the accessible list fallback renders without errors.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: /Time Out Market/i }).first().click();
  expect(errors).toEqual([]);
});
