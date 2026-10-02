/**
 * Integration points between the platform layer (inbound texts) and feature slices.
 */
import { asService, auditLog, getDb } from "@wandr/db";

/**
 * A link texted to our number (FR-82, FR-83, FR-L2, LB-7): filed into the sender's most recently
 * active trip, else their library; resolved in the background. See server/text-intake.ts.
 */
export async function onTextedIdea(phone: string, url: string): Promise<{ reply: string }> {
  const db = await getDb();
  const { handleTextedIdea } = await import("@/server/text-intake");
  const { enqueue } = await import("@/server/jobs");
  const out = await handleTextedIdea(db, phone, url);
  if (out.job) await enqueue(out.job);
  return { reply: out.reply };
}

/**
 * A draft expense from a texted receipt photo (FR-82, §6.5).
 * TODO(expenses slice): create the draft expense for `memberId` in `tripId` from the stored
 * photo at `storagePath` (private bucket), kick off receipt reading, and return a link to split
 * it (the reply falls back to the member's personal link). Must not throw for bad photos.
 */
export async function onReceiptDraft(d: {
  tripId: string;
  memberId: string;
  storagePath: string;
  contentType: string;
  receivedAt: Date;
}): Promise<{ url?: string | null } | void> {
  console.info(`[hooks] onReceiptDraft trip=${d.tripId} member=${d.memberId} path=${d.storagePath} (not wired yet)`);
}

/** A photo texted to our number (FR-82): treated as a receipt for the most recently active trip. */
export async function onTextedReceipt(phone: string, mediaUrls: string[]): Promise<{ reply: string }> {
  const db = await getDb();
  const { handleTextedReceipt } = await import("@/server/text-intake");
  const { fetchTwilioMedia, storeReceiptMedia } = await import("@/lib/messaging/media");
  return handleTextedReceipt(db, phone, mediaUrls, {
    fetchMedia: (u) => fetchTwilioMedia(u),
    store: storeReceiptMedia,
    onDraft: onReceiptDraft,
  });
}

/**
 * Someone replied WRONG (J-4, FR-16): texts to the number are already stopped and its personal
 * links revoked. Log it per trip and alert each trip's organizers.
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
  const { alertOrganizersWrongNumber } = await import("@/server/notify");
  await alertOrganizersWrongNumber(db, e.members).catch((err) =>
    console.error("[hooks] organizer WRONG alert failed", err),
  );
}
