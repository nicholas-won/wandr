"use server";

import { z } from "zod";
import { SHARE_KINDS, type ShareKind } from "@wandr/core/messaging";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { createShare } from "@/server/share";

export type ShareActionResult =
  | { ok: true; url: string; message: string }
  | { ok: false; error: string; signin?: string };

const input = z.object({
  kind: z.enum(SHARE_KINDS as unknown as [ShareKind, ...ShareKind[]]),
  subjectId: z.string().uuid(),
});

/**
 * FR-80a: freeze a share card and return the prefilled text + link. Any active member may share
 * (a personal-link session included: it only exposes group-safe content, FR-80e).
 */
export async function createShareAction(tripId: string, kind: string, subjectId: string): Promise<ShareActionResult> {
  try {
    const parsed = input.parse({ kind, subjectId });
    const { db, claims } = await tripContext(tripId);
    if (!claims.sub && !claims.link_member) {
      return { ok: false, error: "Open your trip link first.", signin: routes.signin(routes.trip(tripId)) };
    }
    const r = await createShare(db, claims, { tripId, ...parsed });
    if (!r.ok) {
      return {
        ok: false,
        error:
          r.error === "surprise"
            ? "Surprise items never go to the group chat."
            : r.error === "not_ready"
              ? "This isn't ready to share yet."
              : "We couldn't find that.",
      };
    }
    return { ok: true, url: r.url, message: r.message };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
