import { describe, expect, it } from "vitest";
import { assertTwilioMediaUrl, fetchTwilioMedia, isAllowedMediaHost, MediaError } from "./media";
import { digestEmail, intakeReplies, notifyTexts } from "./notify-texts";

const to = { name: "Sam", link: "https://x.app/l/abc" };

describe("notify texts (FR-80, FR-81, FR-84, J-19)", () => {
  it("balance texts carry direction only, a personal link and the WRONG footer", () => {
    const t = notifyTexts.balance({
      to,
      tripName: "Booze cruise 2026",
      actorName: "Nick",
      directions: [{ currency: "EUR", direction: "owes" }],
      otherName: "Nick",
    });
    expect(t).toContain("your trip"); // flagged trip name → neutral fallback
    expect(t).toContain("Now you owe Nick.");
    expect(t).toContain("https://x.app/l/abc");
    expect(t).toContain("Not Sam? Reply WRONG");
  });
  it("multi-currency balances name each currency", () => {
    const t = notifyTexts.balance({
      to,
      tripName: "Lisbon",
      actorName: "Nick",
      directions: [
        { currency: "EUR", direction: "owes" },
        { currency: "USD", direction: "owed" },
      ],
    });
    expect(t).toContain("Now you owe (EUR), you're owed (USD).");
  });
  it("replies never include marketing and strip URLs from trip names", () => {
    const r = intakeReplies.savedToTrip({ tripName: "Lisbon www.spam.com", moveUrl: "https://x/move/1", tripUrl: "https://x/t/1" });
    expect(r).toBe("Saved to Lisbon. We're sorting it now. Not for this trip? Move it to your library: https://x/move/1");
  });
  it("digest email lists sanitized titles", () => {
    const e = digestEmail({ tripName: "Lisbon", titles: ["Time Out Market"], count: 3, url: "https://x/t/1" });
    expect(e.subject).toBe("3 new ideas for Lisbon");
    expect(e.text).toContain("...and 2 more");
  });
});

describe("Twilio media fetch (C-20)", () => {
  it("only accepts our account's Twilio media API URL", () => {
    expect(() => assertTwilioMediaUrl("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1", "AC1")).not.toThrow();
    for (const bad of [
      "http://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1",
      "https://api.twilio.com.evil.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1",
      "https://api.twilio.com/2010-04-01/Accounts/AC2/Messages/MM1/Media/ME1",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      expect(() => assertTwilioMediaUrl(bad, "AC1")).toThrow(MediaError);
    }
  });
  it("allows only Twilio media CDN redirect hosts", () => {
    expect(isAllowedMediaHost(new URL("https://mms.twiliocdn.com/a"))).toBe(true);
    expect(isAllowedMediaHost(new URL("https://s3-external-1.amazonaws.com/media.twiliocdn.com/a"))).toBe(true);
    expect(isAllowedMediaHost(new URL("https://s3.amazonaws.com/other-bucket/a"))).toBe(false);
    expect(isAllowedMediaHost(new URL("https://localhost/a"))).toBe(false);
  });
  it("refuses a redirect to a non-Twilio host", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1";
    const { resetEnvForTests } = await import("@/lib/env");
    resetEnvForTests();
    const fake = (async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.1/x" } })) as unknown as typeof fetch;
    await expect(fetchTwilioMedia("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1", fake)).rejects.toThrow("bad_host");
    delete process.env.TWILIO_ACCOUNT_SID;
    resetEnvForTests();
  });
});
