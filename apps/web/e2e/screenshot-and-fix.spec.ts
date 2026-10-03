/**
 * Screenshot ideas (FR-20) and "wrong place? fix" (FR-23) with no external services: the e2e
 * server has no Claude or Google key, so the screenshot can't be read (→ "Is this right?") and
 * the place picker says search isn't connected and offers rename only.
 */
import { expect, test } from "@playwright/test";
import { startTrip } from "./helpers";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("screenshot idea, then fix it by hand when place search isn't connected", async ({ page }, info) => {
  const phone = info.project.name === "phone" ? "202-555-0171" : "202-555-0172";
  await startTrip(page, { phone, name: "Shot", trip: "Shot test" });

  // FR-20: add a screenshot through the image button (the hidden file input behind it).
  await page.locator('input[type="file"]').setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
  const card = page.locator("li").filter({ has: page.getByRole("heading", { name: "Screenshot idea" }) });
  await expect(card).toBeVisible({ timeout: 30_000 });
  // No model: the image wasn't read, so it asks.
  await expect(card.getByText("Is this the right place?")).toBeVisible({ timeout: 30_000 });
  // The screenshot itself is the card's picture, served privately.
  await expect(card.locator('img[src^="/api/screenshot/idea/"]')).toBeVisible();

  // FR-23: Fix → place picker → not connected → rename.
  await card.getByRole("button", { name: "Fix" }).click();
  await expect(card.getByText(/Place search isn.t connected/)).toBeVisible();
  await card.getByLabel("Name").fill("Pastéis de Belém");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pastéis de Belém" })).toBeVisible();
  await expect(page.getByText("Is this the right place?")).toHaveCount(0);

  // FR-L20: the "Search for a place" tab says the same without a key.
  await page.getByRole("tab", { name: "Search for a place" }).click();
  await expect(page.getByText(/Place search isn.t connected/)).toBeVisible();
});

test("HEIC is refused with a clear message", async ({ page }, info) => {
  const phone = info.project.name === "phone" ? "202-555-0173" : "202-555-0174";
  await startTrip(page, { phone, name: "Heic", trip: "Heic test" });
  await page.locator('input[type="file"]').setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: PNG });
  await expect(page.getByText(/HEIC photos aren.t supported yet/)).toBeVisible();
});
