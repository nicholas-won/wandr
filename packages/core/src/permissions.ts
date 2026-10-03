/**
 * Role / scope policy (FR-2, FR-3, FR-5, FR-6, FR-8, FR-9, FR-23, FR-49, FR-68, FR-69, FR-71,
 * §6.10 table, D4, D5, D21, D32, D34).
 *
 * Scope:
 * - `link`: a personal-link session (FR-5). "Opening it lets that person view and vote instantly,
 *   with no code … So a forwarded link can at most cast a vote." Read strictly: a link session may
 *   ONLY view and vote. Everything else returns `needsCode: true` (ask for the SMS code once on
 *   that device, then retry with scope `full`).
 * - `full`: SMS-code verified session.
 *
 * The database enforces the same rules via RLS; this module is the readable spec + UI gate.
 */
import type { MemberId, MemberRole, MemberStatus, TripSize } from "./domain";

export type SessionScope = "link" | "full";

export const ACTIONS = [
  "view_trip_name",
  "view_trip",
  "vote",
  "add_idea",
  "comment",
  "edit_idea_details",
  "change_idea_status",
  "manage_stages",
  "create_poll",
  "close_poll",
  "invite",
  "approve_join",
  "remove_member",
  "change_role",
  "transfer_ownership",
  /** JR3: owner only; soft-deletes the trip for everyone (money history kept, NFR-5/NFR-7). */
  "delete_trip",
  "change_settings",
  "view_money",
  "add_expense",
  "edit_expense",
  "record_payment",
  "set_attendance",
  "toggle_surprise",
  "mark_guest_of_honor",
] as const;
export type Action = (typeof ACTIONS)[number];

export interface Actor {
  memberId: MemberId;
  role: MemberRole;
  status: MemberStatus;
  scope: SessionScope;
}

export interface PermissionContext {
  /** Current trip size; gates size-dependent features (§6.10). */
  tripSize?: TripSize;
  /**
   * The member acted on: vote/set_attendance on behalf of someone (managed members, FR-11/V-14),
   * remove_member, change_role, transfer_ownership.
   */
  target?: {
    memberId: MemberId;
    role: MemberRole;
    managedByMemberId?: MemberId | null;
    /**
     * For a managed member: is their manager still active? `false` once the manager left or was
     * removed; organizers then act for them (JR11). Omitted = active.
     */
    managerActive?: boolean;
  };
  /** FR-9: removing a member with an open balance requires resolving it first. */
  targetHasOpenBalance?: boolean;
  /** edit_expense (FR-68/69). */
  expense?: { uploaderMemberId: MemberId; locked: boolean };
}

export type DenyReason =
  | "not_a_member"
  | "pending_approval"
  | "needs_code"
  | "organizers_only"
  | "owner_only"
  | "owner_cannot_be_removed"
  | "cannot_remove_self"
  | "resolve_balance_first"
  | "expense_locked_use_adjustment"
  | "not_uploader"
  | "not_available_for_trip_size"
  | "not_your_member"
  | "target_required";

export type Decision =
  | { allowed: true; reason?: undefined; needsCode?: undefined }
  | { allowed: false; reason: DenyReason; needsCode?: boolean };

const ALLOW: Decision = { allowed: true };
const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

/** FR-5: the only things a personal-link session can do without a code. */
const LINK_SCOPE_ACTIONS: ReadonlySet<Action> = new Set<Action>(["view_trip_name", "view_trip", "vote"]);

/** FR-2/FR-49/D4: owner + organizers only. */
const ORGANIZER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "change_idea_status",
  "manage_stages",
  "create_poll",
  "close_poll",
  "invite",
  "approve_join",
  "remove_member",
  "change_role",
  "change_settings",
  "toggle_surprise",
  "mark_guest_of_honor",
]);

const isOrganizer = (role: MemberRole) => role === "owner" || role === "organizer";

/**
 * Acting on behalf of `target`: yourself, a managed member you manage (FR-11, V-14), or, as an
 * organizer, a managed member whose manager is no longer active (JR11).
 */
function actsFor(actor: Actor, ctx: PermissionContext | undefined): boolean {
  const t = ctx?.target;
  if (!t) return true; // defaults to self
  if (t.memberId === actor.memberId || t.managedByMemberId === actor.memberId) return true;
  return !!t.managedByMemberId && t.managerActive === false && isOrganizer(actor.role);
}

/**
 * JR11: who acts for a managed member. Their manager while active; otherwise the trip's
 * organizers. Pure helper for the UI and server checks.
 */
export function managedMemberActors(m: {
  managedByMemberId: MemberId | null;
  managerActive: boolean;
}): "manager" | "organizers" | null {
  if (!m.managedByMemberId) return null;
  return m.managerActive ? "manager" : "organizers";
}

/** §6.10: features hidden at a given size. */
function availableAtSize(action: Action, size: TripSize | undefined): boolean {
  if (!size) return true;
  switch (action) {
    case "create_poll":
    case "close_poll":
      return size !== "solo"; // polls hidden in solo
    case "toggle_surprise":
      return size !== "solo"; // surprise mode: duo + group
    case "mark_guest_of_honor":
      return size === "group"; // bachelor/bachelorette mode: group only (opt-in)
    default:
      return true;
  }
}

/**
 * Can `actor` perform `action`? Pure; evaluates in this order:
 * 1. status (removed/invited → nothing; pending → trip name only, FR-6)
 * 2. trip-size availability (§6.10)
 * 3. role (owner/organizer/member)
 * 4. scope: a `link` session gets `needsCode` for anything beyond view + vote (FR-5)
 * Step 4 is applied last so we only ask for a code when the action would then be allowed.
 */
export function can(actor: Actor, action: Action, ctx?: PermissionContext): Decision {
  // 1. Status
  switch (actor.status) {
    case "removed":
    case "invited":
      return deny("not_a_member");
    case "pending":
      return action === "view_trip_name" ? ALLOW : deny("pending_approval");
    case "not_attending":
      // M-9: dropped out — keeps read access and money, no say in decisions.
      if (!["view_trip_name", "view_trip", "view_money", "record_payment"].includes(action)) {
        return deny("not_a_member");
      }
      break;
    case "active":
      break;
  }

  // 2. Size
  if (!availableAtSize(action, ctx?.tripSize)) return deny("not_available_for_trip_size");

  // 3. Role
  const roleDecision = roleCheck(actor, action, ctx);
  if (!roleDecision.allowed) return roleDecision;

  // 4. Scope
  if (actor.scope === "link" && !LINK_SCOPE_ACTIONS.has(action)) {
    return { allowed: false, reason: "needs_code", needsCode: true };
  }
  return ALLOW;
}

function roleCheck(actor: Actor, action: Action, ctx: PermissionContext | undefined): Decision {
  if (ORGANIZER_ACTIONS.has(action) && !isOrganizer(actor.role)) return deny("organizers_only");

  switch (action) {
    case "vote":
      return actsFor(actor, ctx) ? ALLOW : deny("not_your_member");

    case "set_attendance":
      // Q13: organizers can set attendance for anyone; others for themselves / their managed members.
      return actsFor(actor, ctx) || isOrganizer(actor.role) ? ALLOW : deny("not_your_member");

    case "delete_trip":
      return actor.role === "owner" ? ALLOW : deny("owner_only");

    case "remove_member": {
      const t = ctx?.target;
      if (!t) return deny("target_required");
      if (t.role === "owner") return deny("owner_cannot_be_removed"); // FR-2
      if (t.memberId === actor.memberId) return deny("cannot_remove_self");
      if (ctx?.targetHasOpenBalance) return deny("resolve_balance_first"); // FR-9
      return ALLOW;
    }

    case "change_role": {
      const t = ctx?.target;
      if (!t) return deny("target_required");
      // The owner role only moves via transfer_ownership (FR-2, D34); nobody demotes the owner.
      if (t.role === "owner") return deny("owner_only");
      return ALLOW;
    }

    case "transfer_ownership":
      if (actor.role !== "owner") return deny("owner_only");
      if (!ctx?.target) return deny("target_required");
      return ALLOW;

    case "edit_expense": {
      const e = ctx?.expense;
      if (!e) return deny("target_required");
      if (e.locked) return deny("expense_locked_use_adjustment"); // FR-69
      if (e.uploaderMemberId !== actor.memberId && !isOrganizer(actor.role)) return deny("not_uploader"); // FR-68
      return ALLOW;
    }

    default:
      // view_trip_name, view_trip, add_idea, comment, edit_idea_details (FR-23 any member),
      // view_money, add_expense, record_payment (FR-71), and organizer actions already checked.
      return ALLOW;
  }
}

// ---------------------------------------------------------------------------
// Owner succession (FR-3, J-11, D44 / DN-4 option A)
// ---------------------------------------------------------------------------

export interface SuccessionCandidate {
  memberId: MemberId;
  role: MemberRole;
  status: MemberStatus;
  /** When they joined the trip (tenure). */
  joinedAt: Date | number | string;
  /** Managed members (FR-11) can't sign in, so they can't own a trip. */
  managedByMemberId?: MemberId | null;
}

/**
 * FR-3: if the owner leaves without picking a successor, the longest-standing organizer becomes
 * owner; if there is none, the longest-tenured active member (J-11). Managed members are skipped.
 * Ties on join time break by member id for determinism. Returns null if nobody is eligible.
 */
export function pickSuccessor(
  members: readonly SuccessionCandidate[],
  departingOwnerId: MemberId,
): MemberId | null {
  const pool = members
    .filter((m) => m.memberId !== departingOwnerId && m.status === "active" && !m.managedByMemberId)
    .map((m) => ({ ...m, t: new Date(m.joinedAt).getTime() }))
    .sort((a, b) => a.t - b.t || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  const organizer = pool.find((m) => m.role === "organizer");
  return (organizer ?? pool[0])?.memberId ?? null;
}
