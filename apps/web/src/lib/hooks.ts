/**
 * Integration points that later slices fill in. Each one is called by the platform layer today
 * and does the minimum safe thing until wired up.
 */
import { asService, auditLog, getDb } from "@wandr/db";

/**
 * A link texted to our number (FR-82, FR-83).
 * TODO(hero slice): run the idea pipeline (FR-20–26): pick the sender's most recently active trip
 * and Stop, create the idea, reply with the card link and a "move it" link. Treat the URL as
 * untrusted (SSRF guard C-20; captions are data, not instructions C-21).
 */
export async function onTextedIdea(phone: string, url: string): Promise<{ reply: string }> {
  console.info(`[hooks] onTextedIdea from ${phone.slice(-4)}: ${url.slice(0, 200)} (not wired yet)`);
  return { reply: "Got it! We'll add that to your most recent trip." };
}

/**
 * A photo texted to our number (FR-82): treated as a receipt.
 * TODO(expenses slice §6.5): download media from Twilio (authenticated), read the receipt, file it
 * under the most recently active trip, and reply with a split link.
 */
export async function onTextedReceipt(phone: string, mediaUrls: string[]): Promise<{ reply: string }> {
  console.info(`[hooks] onTextedReceipt from ${phone.slice(-4)}: ${mediaUrls.length} file(s) (not wired yet)`);
  return { reply: "Got it! We'll add that receipt to your most recent trip." };
}

/**
 * Someone replied WRONG (J-4, FR-16): texts to the number are already stopped and its personal
 * links revoked. Alert each affected trip's organizers.
 * TODO(messaging slice §6.6): push/text the organizers ("Texts to Sam may be reaching someone
 * else"). For now this writes an audit entry per trip, which an organizer view can surface.
 */
export async function onWrongNumber(e: { members: { memberId: string; tripId: string }[] }): Promise<void> {
  if (e.members.length === 0) return;
  const db = await getDb();
  await asService(db, (tx) =>
    tx.insert(auditLog).values(
      e.members.map((m) => ({
        tripId: m.tripId,
        action: "member.wrong_number",
        entity: "member",
        entityId: m.memberId,
      })),
    ),
  );
  console.warn(`[hooks] WRONG reported for ${e.members.length} membership(s); organizers need alerting`);
}
