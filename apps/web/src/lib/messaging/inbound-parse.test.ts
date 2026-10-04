import { describe, expect, it } from "vitest";
import { parseInbound, routeInbound, type RouteContext } from "./inbound-parse";

const p = (body: string, mediaUrls?: string[]) => parseInbound({ body, mediaUrls });

describe("opt-out parsing (FR-85, NFR-7, N-1)", () => {
  it("recognizes carrier keywords in any case, with punctuation", () => {
    for (const k of ["STOP", "stop", "Stop.", "STOPALL", "UNSUBSCRIBE", "cancel", "END", "quit", " Stop! ", "REVOKE", "OPTOUT"]) {
      expect(p(k)).toEqual({ type: "stop", informal: false });
    }
  });

  it("recognizes informal opt-outs", () => {
    for (const s of [
      "stop texting me",
      "Please stop texting me!!",
      "leave me alone",
      "Don't text me again",
      "do not message me",
      "take me off this list",
      "unsubscribe me please",
      "no more texts",
    ]) {
      expect(p(s)).toEqual({ type: "stop", informal: true });
    }
  });

  it("does not treat ordinary words as opt-outs", () => {
    expect(p("the end of the trip was fun").type).not.toBe("stop");
    expect(p("can't stop thinking about Lisbon").type).not.toBe("stop");
  });

  it("recognizes START/UNSTOP and HELP/INFO", () => {
    expect(p("START")).toEqual({ type: "start" });
    expect(p("unstop")).toEqual({ type: "start" });
    expect(p("HELP")).toEqual({ type: "help" });
    expect(p("info")).toEqual({ type: "help" });
  });

  it("recognizes WRONG and reassigned-number replies (J-4)", () => {
    for (const s of ["WRONG", "wrong number", "Wrong person sorry", "who is this?", "Who's this", "new number", "not me"]) {
      expect(p(s)).toEqual({ type: "wrong" });
    }
    expect(p("I'm not sure").type).not.toBe("wrong");
  });
});

describe("answer parsing (FR-82, N-6)", () => {
  it("reads votes 1/2/3 in common forms", () => {
    expect(p("1")).toEqual({ type: "vote", value: "must" });
    expect(p(" 2 ")).toEqual({ type: "vote", value: "down" });
    expect(p("3.")).toEqual({ type: "vote", value: "pass" });
    expect(p("#1")).toEqual({ type: "vote", value: "must" });
    expect(p("1️⃣")).toEqual({ type: "vote", value: "must" });
    expect(p("Must-do")).toEqual({ type: "vote", value: "must" });
    expect(p("pass")).toEqual({ type: "vote", value: "pass" });
  });

  it("reads Y/N", () => {
    for (const s of ["Y", "yes", "Yep", "approve"]) expect(p(s)).toEqual({ type: "yes" });
    for (const s of ["N", "no", "nope", "deny"]) expect(p(s)).toEqual({ type: "no" });
  });

  it("reads UNDO", () => {
    expect(p("undo")).toEqual({ type: "undo" });
  });

  it("ignores tapback reactions", () => {
    expect(p('Liked "Reply 1, 2 or 3"').type).toBe("tapback");
    expect(p("Loved “New idea for Lisbon”").type).toBe("tapback");
    expect(p('Reacted 👍 to "Reply 1, 2 or 3"').type).toBe("tapback");
  });

  it("extracts a texted link as an idea", () => {
    expect(p("check this out https://www.tiktok.com/@x/video/123?lang=en.")).toEqual({
      type: "url",
      url: "https://www.tiktok.com/@x/video/123?lang=en",
    });
    expect(p("www.example.com/place")).toEqual({ type: "url", url: "www.example.com/place" });
  });

  it("treats media as a receipt, even with a caption", () => {
    expect(p("dinner", ["https://api.twilio.com/m/1"])).toEqual({ type: "media", mediaUrls: ["https://api.twilio.com/m/1"] });
  });

  it("STOP wins over everything, even with media", () => {
    expect(p("STOP", ["https://api.twilio.com/m/1"]).type).toBe("stop");
  });

  it("returns unknown/empty otherwise", () => {
    expect(p("both?")).toEqual({ type: "unknown" });
    expect(p("   ")).toEqual({ type: "empty" });
  });
});

describe("routing (FR-83, DN-23)", () => {
  const ctx = (o: Partial<RouteContext> = {}): RouteContext => ({ openQuestion: null, hasUndo: false, optedOut: false, ...o });
  const voteQ = { kind: "vote" as const, expired: false };
  const joinQ = { kind: "approve_join" as const, expired: false };

  it("casts a vote only against an open vote question", () => {
    expect(routeInbound(p("1"), ctx({ openQuestion: voteQ }))).toEqual({ action: "cast_vote", value: "must" });
    expect(routeInbound(p("1"), ctx())).toEqual({ action: "no_open_question" });
    expect(routeInbound(p("1"), ctx({ openQuestion: { ...voteQ, expired: true } }))).toEqual({ action: "question_closed" });
    expect(routeInbound(p("1"), ctx({ openQuestion: joinQ }))).toEqual({ action: "hint", expected: "yes_no" });
  });

  it("decides joins with Y/N", () => {
    expect(routeInbound(p("Y"), ctx({ openQuestion: joinQ }))).toEqual({ action: "decide_join", approve: true });
    expect(routeInbound(p("n"), ctx({ openQuestion: joinQ }))).toEqual({ action: "decide_join", approve: false });
    expect(routeInbound(p("y"), ctx({ openQuestion: voteQ }))).toEqual({ action: "hint", expected: "vote" });
  });

  it("treats YES from an opted-out number with no question as opt-in", () => {
    expect(routeInbound(p("yes"), ctx({ optedOut: true }))).toEqual({ action: "opt_in" });
  });

  it("opt-out always wins, even mid-question", () => {
    expect(routeInbound(p("STOP"), ctx({ openQuestion: voteQ }))).toEqual({ action: "opt_out", informal: false });
  });

  it("undo only when there is something to undo", () => {
    expect(routeInbound(p("UNDO"), ctx({ hasUndo: true }))).toEqual({ action: "undo" });
    expect(routeInbound(p("UNDO"), ctx())).toEqual({ action: "nothing_to_undo" });
  });

  it("hands links and photos to the idea/receipt hooks", () => {
    expect(routeInbound(p("https://maps.app.goo.gl/abc"), ctx())).toEqual({ action: "texted_idea", url: "https://maps.app.goo.gl/abc" });
    expect(routeInbound(p("", ["u"]), ctx())).toEqual({ action: "texted_receipt", mediaUrls: ["u"] });
  });

  it("hints on gibberish while a question is open", () => {
    expect(routeInbound(p("hmm"), ctx({ openQuestion: voteQ }))).toEqual({ action: "hint", expected: "vote" });
    expect(routeInbound(p("hmm"), ctx())).toEqual({ action: "unrecognized" });
    expect(routeInbound(p('Liked "x"'), ctx({ openQuestion: voteQ }))).toEqual({ action: "tapback" });
  });
});
