import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("website hands off to sign-up, then the app's setup step (D64, D74)", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("actually decides");
  await page.getByText("Do my friends need to download an app?").click();
  await expect(page.getByText(/view and vote right away/)).toBeVisible();

  // Pasting a TikTok on the website opens /start with it filled in, inside the app shell.
  await page.getByLabel("Got a TikTok already? Paste it.").fill("https://www.tiktok.com/@x/video/1");
  await page.getByRole("button", { name: "Go" }).first().click();
  // Sign up first (D74); the pasted link survives the round trip.
  await signUp(page, info.project.name === "phone" ? "202-555-0131" : "202-555-0132", "Paster");
  await expect(page).toHaveURL(/\/start\?raw=/);
  await expect(page.getByRole("heading", { name: "Where are you headed?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "App" })).toBeVisible();
  await expect(page.getByLabel("Link")).toHaveValue("https://www.tiktok.com/@x/video/1");
});
