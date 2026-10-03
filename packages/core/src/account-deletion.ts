/**
 * Deleting your account (FR-3, J-11, NFR-5, NFR-7). Pure functions.
 *
 * Per trip:
 * - You own it and someone else is on it: ownership goes to the successor you pick, else the
 *   longest-standing organizer, else the longest-tenured active member (FR-3, `pickSuccessor`).
 *   People who have verified a number come first; a link-only guest is picked only when nobody
 *   else is left, so the trip isn't taken away from the people still using it.
 * - You own it and you're the only member (managed members you added don't count): the trip is
 *   deleted (soft, JR3).
 * - Anything else: you leave it.
 * In every case your member rows stay as "Former member" so other people's balances still add up
 * (NFR-5, NFR-7: anonymized, never deleted).
 */
import { pickSuccessor, type SuccessionCandidate } from "./permissions";
import type { MemberId, MemberRole, MemberStatus } from "./domain";

/** Shown in place of a deleted person's name, everywhere (NFR-7). */
export const FORMER_MEMBER_NAME = "Former member";

/** What the confirmation field asks for. */
export const ACCOUNT_DELETE_WORD = "delete";

export function accountDeleteConfirmed(typed: string): boolean {
  return typed.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase() === ACCOUNT_DELETE_WORD;
}

export interface AccountTripMember extends SuccessionCandidate {
  displayName: string;
  /** Has a verified phone or email (can sign in and act as owner). */
  verified: boolean;
}

export interface AccountTrip {
  tripId: string;
  tripName: string;
  myMemberId: MemberId;
  myRole: MemberRole;
  myStatus: MemberStatus;
  /** Every member row of the trip, the caller's included. */
  members: readonly AccountTripMember[];
}

export type AccountTripPlan =
  | {
      kind: "hand_over";
      tripId: string;
      tripName: string;
      myMemberId: MemberId;
      successorMemberId: MemberId;
      successorName: string;
      /** Whether the successor came from the caller's pick (else the FR-3 default). */
      picked: boolean;
      /** Who the caller may pick from, default first. */
      candidates: { memberId: MemberId; name: string }[];
    }
  | { kind: "delete_trip"; tripId: string; tripName: string; myMemberId: MemberId }
  | { kind: "leave"; tripId: string; tripName: string; myMemberId: MemberId; alreadyFormer: boolean };

/** Who could own the trip after the caller: verified people first, else anyone active (not managed). */
export function successionCandidates(trip: AccountTrip): AccountTripMember[] {
  const others = trip.members.filter(
    (m) => m.memberId !== trip.myMemberId && m.status === "active" && !m.managedByMemberId,
  );
  const verified = others.filter((m) => m.verified);
  const pool = verified.length ? verified : others;
  const first = pickSuccessor(pool, trip.myMemberId);
  const rest = pool
    .filter((m) => m.memberId !== first)
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() || (a.memberId < b.memberId ? -1 : 1));
  return first ? [pool.find((m) => m.memberId === first)!, ...rest] : [];
}

export function planAccountDeletion(
  trips: readonly AccountTrip[],
  picks: Readonly<Record<string, string>> = {},
): AccountTripPlan[] {
  return trips.map((t): AccountTripPlan => {
    const base = { tripId: t.tripId, tripName: t.tripName, myMemberId: t.myMemberId };
    if (t.myRole !== "owner" || t.myStatus === "removed") {
      return { kind: "leave", ...base, alreadyFormer: t.myStatus === "removed" };
    }
    const candidates = successionCandidates(t);
    if (candidates.length === 0) return { kind: "delete_trip", ...base };
    const pick = picks[t.tripId];
    const chosen = candidates.find((c) => c.memberId === pick) ?? candidates[0]!;
    return {
      kind: "hand_over",
      ...base,
      successorMemberId: chosen.memberId,
      successorName: chosen.displayName,
      picked: chosen.memberId === pick,
      candidates: candidates.map((c) => ({ memberId: c.memberId, name: c.displayName })),
    };
  });
}
