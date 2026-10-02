/**
 * Rich preview image for group chats (FR-80b, §7a @vercel/og via next/og). Renders the frozen
 * snapshot only; no remote images are fetched (no SSRF surface, no third-party CDN calls).
 * Unknown/hidden shares get a generic card.
 */
import { ImageResponse } from "next/og";
import { APP_NAME } from "@wandr/core/config";
import { shareCopy } from "@wandr/core/messaging";
import { getDb } from "@wandr/db";
import { getPublicShare } from "@/server/share";

export const alt = `A trip card from ${APP_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1c1917";
const MUTED = "#57534e";
const ACCENT = "#e8590c";
const PAPER = "#fffaf3";

export default async function Image({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const share = await getPublicShare(await getDb(), kind, id);
  const s = share?.snapshot;
  const c = s ? shareCopy(s) : { headline: "You have a trip update", detail: "", cta: "Tap to see" };
  const lines: string[] =
    s?.kind === "poll" ? s.options.slice(0, 4) : s?.kind === "digest" ? s.titles.slice(0, 4) : c.detail ? [c.detail] : [];
  const deadline =
    s?.kind === "poll" && s.closesAt
      ? `Closes ${new Date(s.closesAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}`
      : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: 64,
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 800 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: ACCENT, display: "flex" }} />
          {APP_NAME}
          {s ? <span style={{ color: MUTED, fontWeight: 600, marginLeft: 16 }}>{s.tripName}</span> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, display: "flex" }}>{c.headline}</div>
          {lines.map((l) => (
            <div key={l} style={{ fontSize: 34, color: MUTED, display: "flex" }}>
              {s?.kind === "poll" || s?.kind === "digest" ? `• ${l}` : l}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              background: ACCENT,
              color: "white",
              borderRadius: 999,
              padding: "16px 36px",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            {c.cta}
          </div>
          {deadline ? <div style={{ fontSize: 30, color: MUTED, display: "flex" }}>{deadline}</div> : null}
        </div>
      </div>
    ),
    size,
  );
}
