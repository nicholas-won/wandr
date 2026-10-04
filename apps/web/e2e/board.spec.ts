/** Board view (founder request): group ideas by city and move them between columns. */
import { expect, test } from "@playwright/test";
import { startTrip } from "./helpers";

test("board: move an idea from Lisbon to Porto, and it stays there", async ({ page }, info) => {
  await startTrip(page, {
    phone: info.project.name === "phone" ? "202-555-0161" : "202-555-0162",
    name: "Boarder",
    trip: "Board test",
    city: "Lisbon, Porto",
  });
  await page.getByLabel("Paste a link or type an idea").fill("Pastéis de Belém");
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByRole("heading", { name: /Pastéis de Belém/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/view=board/);
  const col = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: new RegExp(`^${name}\\b`) }) });

  // The typed idea has no location, so it starts Unsorted (or in Lisbon if it got filed).
  const card = page.getByRole("button", { name: /Pastéis de Belém/ });
  await expect(card).toBeVisible();
  await page.getByLabel("Move to").first().selectOption({ label: "Porto" });
  await expect(page.getByText(/Moved “Pastéis de Belém” to Porto/)).toBeVisible();

  await page.reload();
  await expect(col("Porto").getByRole("button", { name: /Pastéis de Belém/ })).toBeVisible();

  // Opening a card shows the full idea with Edit.
  await col("Porto").getByRole("button", { name: /Pastéis de Belém/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Edit/ })).toBeVisible();
});
