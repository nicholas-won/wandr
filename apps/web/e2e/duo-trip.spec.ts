/**
 * The founder's first real test is a duo trip (D54): start → idea → invite → the other person
 * opens their personal link and votes with no app → both see each other's votes (§6.10).
 */
import { expect, test } from "@playwright/test";
import { startTrip } from "./helpers";

test("duo trip: idea, invite, personal link, open votes", async ({ page, browser }, info) => {
  const isPhone = info.project.name === "phone";
  // Each project gets its own numbers: the projects share one database.
  const nickPhone = isPhone ? "202-555-0111" : "202-555-0101";
  const samPhone = isPhone ? "202-555-0152" : "202-555-0142";
  // D74: Nick signs up with a number first, so the trip is saved to it from the start.
  await startTrip(page, { phone: nickPhone, name: "Nick", trip: "Nick & Sam" });

  // Add a typed idea (no network needed) and see the card fill in.
  await page.getByLabel("Paste a link or type an idea").fill("Pastéis de Belém");
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByRole("heading", { name: /Pastéis de Belém/ })).toBeVisible({ timeout: 30_000 });

  // Already signed up, so inviting needs no extra step.
  const tripUrl = page.url().split("?")[0]!;
  await page.goto(`${tripUrl}/people`);
  await page.getByLabel("Name").fill("Sam");
  await page.getByLabel("Mobile").fill(samPhone);
  await page.getByRole("button", { name: /Text them an invite/ }).click();
  const sendLink = page.getByRole("link", { name: /Send to Sam from my phone/ });
  await expect(sendLink).toBeVisible();
  const smsHref = (await sendLink.getAttribute("href")) ?? "";
  const personalLink = decodeURIComponent(smsHref).match(/https?:\/\/\S+\/l\/[\w-]+/)?.[0];
  expect(personalLink, "personal link in the share text").toBeTruthy();

  // Sam is only invited so far, so it's still a solo trip: Nick's vote is a personal priority
  // (D55) with no reveal. It carries over once Sam joins (FR-T3).
  await page.goto(tripUrl);
  const must = page.getByRole("button", { name: /Must-do/ }).first();
  await must.click();
  await expect(must).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("You: Must-do")).toHaveCount(0);

  // Sam: fresh device, no account, no app. Opens the personal link and votes (FR-5, NFR-2).
  const sam = await browser.newContext(info.project.use);
  const samPage = await sam.newPage();
  const linkPath = new URL(personalLink!).pathname;
  await samPage.goto(linkPath);
  // Automated browsers don't auto-open (scanner protection), so tap the fallback button.
  await samPage.getByRole("button", { name: "Open my trip" }).click();
  // Q37/D67: opening never joins. Sam sees the trip, types their own name, accepts explicitly,
  // and can skip confirming a number (view + vote only).
  await expect(samPage.getByRole("heading", { name: "Nick & Sam" })).toBeVisible();
  await expect(samPage.getByText("With Nick")).toBeVisible();
  await expect(samPage.getByLabel("What's your name?")).toHaveValue("Sam");
  await samPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(samPage.getByRole("heading", { name: "Confirm your number" })).toBeVisible();
  await samPage.getByRole("button", { name: "Skip for now" }).click();
  await expect(samPage.getByRole("heading", { name: /Pastéis de Belém/ })).toBeVisible();
  await samPage.getByRole("button", { name: /Down/ }).first().click();
  // Duo: votes are open from the start (§6.10).
  await expect(samPage.getByText(/Nick: Must-do/)).toBeVisible();
  // A personal link can't add ideas (FR-5): no capture box for link sessions.
  await expect(samPage.getByLabel("Paste a link or type an idea")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/Sam: Down/)).toBeVisible();

  // FR-46: comment threads. Nick (signed in) comments; Sam reads it from the personal link,
  // and is asked to confirm a number before writing (FR-5).
  await page.getByRole("button", { name: "Comment", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Go early, the line gets long");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Go early, the line gets long")).toBeVisible();
  await expect(page.getByText("sending…")).toHaveCount(0);
  await samPage.reload();
  await samPage.getByRole("button", { name: "1 comment", exact: true }).first().click();
  await expect(samPage.getByText("Go early, the line gets long")).toBeVisible();
  await expect(samPage.getByRole("link", { name: "Confirm your number" })).toBeVisible();
  await sam.close();
});
