/** HTML marker look for MapLibre. Colours are the app's CSS tokens, so light and dark themes follow. */
import type { DrawMarker } from "./types";

export function markerKey(d: DrawMarker): string {
  return d.marker.key;
}

export function styleMarkerElement(el: HTMLElement, d: DrawMarker, interactive: boolean): void {
  const m = d.marker;
  const s = el.style;
  el.className = "wandr-marker";
  if (interactive) {
    // The list next to the map is the keyboard path; markers stay out of the tab order.
    el.tabIndex = -1;
    el.setAttribute("aria-label", d.ariaLabel);
    if (el instanceof HTMLButtonElement) el.type = "button";
    if (m.kind === "pin") el.setAttribute("aria-pressed", String(d.selected));
    else el.removeAttribute("aria-pressed");
  } else {
    el.setAttribute("aria-hidden", "true");
  }
  s.display = "grid";
  s.placeItems = "center";
  s.padding = "0";
  s.borderRadius = "9999px";
  s.fontFamily = "inherit";
  s.fontWeight = "700";
  s.lineHeight = "1";
  s.cursor = interactive ? "pointer" : "default";
  s.boxShadow = "0 1px 3px rgb(0 0 0 / 0.35)";
  s.transition = "none";

  if (m.kind === "cluster") {
    const size = m.count >= 100 ? 44 : m.count >= 10 ? 38 : 32;
    s.width = s.height = `${size}px`;
    s.background = "var(--foreground)";
    s.color = "var(--background)";
    s.border = "3px solid color-mix(in srgb, var(--background) 70%, transparent)";
    s.fontSize = "13px";
    s.opacity = "1";
    s.zIndex = "2";
    el.textContent = String(m.count);
    return;
  }

  const label = m.pin.label ?? "";
  const size = d.selected ? (label ? 32 : 26) : label ? 24 : 16;
  s.width = s.height = `${size}px`;
  s.background = `var(${d.token})`;
  s.color = "var(--vote-foreground)";
  s.border = `2px solid var(--card)`;
  s.outline = d.selected ? "3px solid var(--foreground)" : "none";
  s.outlineOffset = "1px";
  s.fontSize = d.selected ? "13px" : "11px";
  s.opacity = d.dimmed && !d.selected ? "0.45" : "1";
  s.zIndex = d.selected ? "5" : d.dimmed ? "1" : "3";
  el.textContent = label; // text only: titles and labels come from shared links (C-21)
}
