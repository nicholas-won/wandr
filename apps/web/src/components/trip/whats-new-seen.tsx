"use client";

import { useEffect } from "react";
import { seenCookieName } from "@/lib/whats-new-cookie";

/** Remembers this visit on this device, so the next visit shows only what's new since now. */
export function MarkSeen({ tripId }: { tripId: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      document.cookie = `${seenCookieName(tripId)}=${Date.now()}; Path=/t/${tripId}; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax`;
    }, 4000); // count it as seen once they've actually looked
    return () => clearTimeout(t);
  }, [tripId]);
  return null;
}
