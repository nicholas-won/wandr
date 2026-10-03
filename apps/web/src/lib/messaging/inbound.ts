/**
 * Inbound texts (D65, FR-85, FR-16; J-4, M-12). The app's number only honors STOP/START, HELP and
 * WRONG; everything else gets one short pointer to the app. No votes, approvals, links or
 * receipts are taken by text any more (FR-82/83 removed).
 */
import { and, eq, ne } from "drizzle-orm";
import { asService, getDb, memberContacts, members, smsOpenQuestions, smsUndo, users, type Tx } from "@wandr/db";
import { revokeLinksForMembers } from "@/lib/auth/personal-link";
import { appUrl, env } from "@/lib/env";
import { onWrongNumber } from "@/lib/hooks";
import { parseInbound } from "./inbound-parse";
import { setPhoneOptOut } from "./opt-out";
import { logReply } from "./send";
import { replies } from "./templates";

export type InboundSms = { from: string; body: string; mediaUrls: string[] };

/** Members tied to this number, via a user account or an invite-list contact. */
async function membershipsForPhone(tx: Tx, phone: string) {
  const viaUser = await tx
    .select({ memberId: members.id, tripId: members.tripId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(users.phone, phone), ne(members.status, "removed")));
  const viaContact = await tx
    .select({ memberId: members.id, tripId: members.tripId })
    .from(memberContacts)
    .innerJoin(members, eq(members.id, memberContacts.memberId))
    .where(and(eq(memberContacts.phone, phone), ne(members.status, "removed")));
  const seen = new Map<string, { memberId: string; tripId: string }>();
  for (const m of [...viaUser, ...viaContact]) seen.set(m.memberId, m);
  return [...seen.values()];
}

/** Handle one inbound text; returns the reply text (or null for no reply). */
export async function handleInboundSms(msg: InboundSms): Promise<string | null> {
  const db = await getDb();
  const phone = msg.from;
  const intent = parseInbound({ body: msg.body, mediaUrls: msg.mediaUrls });
  let reply: string | null;

  switch (intent.type) {
    case "stop":
      await asService(db, async (tx) => {
        await setPhoneOptOut(tx, phone, true, intent.informal ? "informal" : "stop");
        await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone));
      });
      reply = replies.optedOut();
      break;
    case "start":
      await asService(db, (tx) => setPhoneOptOut(tx, phone, false, "start"));
      reply = replies.optedIn();
      break;
    case "help":
      reply = replies.help({ url: appUrl(), supportEmail: env().SUPPORT_EMAIL });
      break;
    case "wrong": {
      const affected = await asService(db, async (tx) => {
        await setPhoneOptOut(tx, phone, true, "wrong");
        await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone));
        await tx.delete(smsUndo).where(eq(smsUndo.phone, phone));
        const ms = await membershipsForPhone(tx, phone);
        await revokeLinksForMembers(
          tx,
          ms.map((m) => m.memberId),
        );
        return ms;
      });
      await onWrongNumber({ members: affected });
      reply = replies.wrongNumber();
      break;
    }
    case "tapback":
      reply = null; // reactions to our text need no answer
      break;
    default:
      reply = replies.useApp({ url: appUrl() });
  }

  if (reply) {
    const text = reply;
    await asService(db, (tx) => logReply(tx, phone, text)).catch((err) => console.error("[sms] failed to log reply", err));
  }
  return reply;
}
