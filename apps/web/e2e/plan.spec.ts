/** Founder bug: an idea marked Decided must show up on the plan, whatever city it's in. */
import { expect, test } from "@playwright/test";
import { startTrip } from "./helpers";

test("plan: a decided idea with no city shows up, and moves into the city's plan", async ({ page }, info) => {
  await startTrip(page, {
    phone: info.project.name === "phone" ? "202-555-0171" : "202-555-0172",
    name: "Planner",
    trip: "Plan test",
    city: "Lisbon, Porto",
  });
  await page.getByLabel("Paste a link or type an idea").fill("Port tasting");
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByRole("heading", { name: /Port tasting/ })).toBeVisible({ timeout: 30_000 });

  // Mark it Decided from the board (status columns).
  await page.goto(`${new URL(page.url()).pathname.replace(/\/$/, "")}?view=board&group=status`);
  await page.getByLabel("Move to").first().selectOption({ label: "✓ Decided" });
  await expect(page.getByText(/Moved “Port tasting” to ✓ Decided/)).toBeVisible();

  await page.goto(`${new URL(page.url()).pathname.replace(/\/$/, "")}/plan`);
  const tabs = page.getByRole("navigation", { name: "City" });
  await expect(tabs.getByRole("link", { name: /Lisbon/ })).toBeVisible();
  await expect(tabs.getByRole("link", { name: /Porto/ })).toBeVisible();

  // Typed ideas have no city on a two-city trip; they wait here instead of vanishing.
  const unsorted = page.getByRole("region", { name: "Decided, but which city?" });
  await expect(unsorted.getByText("Port tasting")).toBeVisible();
  await unsorted.getByLabel("City").selectOption({ label: "Porto" });
  await unsorted.getByRole("button", { name: "Put it here" }).click();
  await expect(page.getByText("Moved to Porto")).toBeVisible();

  await tabs.getByRole("link", { name: /Porto/ }).click();
  await expect(page).toHaveURL(/stop=/);
  await expect(page.getByText("Port tasting").first()).toBeVisible();
});
