import { describe, expect, it } from "vitest";
import { computeTwilioSignature, verifyTwilioSignature } from "./twilio-signature";
import { twiml } from "./twiml";

// Vectors from Twilio's webhook-security docs / twilio-node test suite.
const TOKEN = "12345";
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS: [string, string][] = Object.entries({
  CallSid: "CA1234567890ABCDE",
  Caller: "+14158675309",
  Digits: "1234",
  From: "+14158675309",
  To: "+18005551212",
});

describe("Twilio signature (X-Twilio-Signature)", () => {
  it("matches Twilio's published example", () => {
    expect(computeTwilioSignature(TOKEN, URL, PARAMS)).toBe("RSOYDt4T1cUTdK1PDd93/VVr8B8=");
    const other = PARAMS.map(([k, v]) => [k, v === "+14158675309" ? "+12349013030" : v] as [string, string]);
    expect(computeTwilioSignature(TOKEN, URL, other)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });

  it("is independent of param order", () => {
    expect(computeTwilioSignature(TOKEN, URL, [...PARAMS].reverse())).toBe("RSOYDt4T1cUTdK1PDd93/VVr8B8=");
  });

  it("verifies good and rejects bad signatures", () => {
    expect(verifyTwilioSignature(TOKEN, "RSOYDt4T1cUTdK1PDd93/VVr8B8=", URL, PARAMS)).toBe(true);
    expect(verifyTwilioSignature(TOKEN, "RSOYDt4T1cUTdK1PDd93/VVr8B8x", URL, PARAMS)).toBe(false);
    expect(verifyTwilioSignature("other", "RSOYDt4T1cUTdK1PDd93/VVr8B8=", URL, PARAMS)).toBe(false);
    expect(verifyTwilioSignature(TOKEN, null, URL, PARAMS)).toBe(false);
    expect(verifyTwilioSignature(TOKEN, "RSOYDt4T1cUTdK1PDd93/VVr8B8=", `${URL}&x=1`, PARAMS)).toBe(false);
    const tampered = PARAMS.map(([k, v]) => [k, k === "Digits" ? "9999" : v] as [string, string]);
    expect(verifyTwilioSignature(TOKEN, "RSOYDt4T1cUTdK1PDd93/VVr8B8=", URL, tampered)).toBe(false);
  });
});

describe("TwiML", () => {
  it("escapes reply text", () => {
    expect(twiml("a < b & \"c\"")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>a &lt; b &amp; &quot;c&quot;</Message></Response>',
    );
    expect(twiml(null)).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
});
