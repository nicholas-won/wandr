"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Poll while any card is still processing (FR-23); stops once everything has resolved. */
export function AutoRefresh({ active, everyMs = 2000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
