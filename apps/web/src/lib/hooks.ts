/**
 * Integration points between the platform layer (inbound texts) and feature slices. Since D65 the
 * only inbound action with side effects beyond opt-outs is WRONG.
 */
import { asService, auditLog, getDb } from "@wandr/db";

/**
 * Someone replied WRONG (J-4, FR-16): texts to the number are already stopped and its personal
 * links revoked. Logged per trip; organizers see it in the app (D65: no organizer texts).
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
}
