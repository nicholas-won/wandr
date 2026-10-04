/**
 * POST /api/v1/trips/:tripId/invites: an organizer adds a name + phone; the invitee gets a
 * personal text with a personal link (FR-4, FR-5, D65). The phone is stored only in
 * member_contacts and never returned (NFR-3). Organizer-only; a pending recycled-number check
 * blocks it (FR-16, J-4).
 */
import { endpoints } from "@wandr/api-contract";
import { ApiFail, handler, notFound, ok, readBody, requireApiUser, uuidParam } from "@/lib/api/v1";
import { activeMember } from "@/server/api-v1";
import { track } from "@/server/analytics";
import { inviteMember } from "@/server/invites";

const ERRORS = {
  invalid_phone: [400, "invalid_phone", "Check the name and number."],
  not_allowed: [403, "forbidden", "Only organizers can invite people."],
  limit: [429, "rate_limited", "That's a lot of invites for now. Try again tomorrow."],
  already_invited: [409, "already_invited", "That number is already on this trip."],
} as const;

export const POST = handler(async (request: Request, ctx: RouteContext<"/api/v1/trips/[tripId]/invites">) => {
  const { db, user } = await requireApiUser(request);
  const tripId = uuidParam((await ctx.params).tripId);
  const body = await readBody(request, endpoints.invite.body);
  if (user.needsRecheck) throw new ApiFail(403, "recheck_required", "Sign in again to confirm it's you.");
  const member = await activeMember(db, user.userId, tripId);
  if (!member) throw notFound();
  const r = await inviteMember(db, { userId: user.userId, tripId, name: body.name, phone: body.phone });
  if (!r.ok) {
    const [status, code, message] = ERRORS[r.error];
    throw new ApiFail(status, code, message);
  }
  await track(db, { name: "invite_sent", tripId, memberId: member.memberId, props: { via: "app", channel: r.channel } });
  return ok("invite", { link: r.link, texted: r.texted }, 201);
});
