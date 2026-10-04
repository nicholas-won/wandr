import type { LinkPreview, LinkStep } from "@/lib/auth/personal-link";

export type OpenLinkState = {
  error?: "invalid" | "revoked" | "removed" | "other_device" | "bad_name";
  /** Q37/Q1: what to confirm before the trip opens. */
  step?: LinkStep;
  preview?: LinkPreview;
  /** Q37: they said "Not me". */
  notMe?: boolean;
};
