/** Threaded idea comments (FR-46) against PGlite + RLS, incl. surprise visibility (FR-91). */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asService, comments, ideas, members, users, withSession, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { createTrip, getTripView } from "../trips";
import { setBachMode, setGuestOfHonor, setIdeaHiddenFrom } from "../surprise";
import {
  addComment,
  CommentError,
  cleanBody,
  commentCounts,
  deleteComment,
  editComment,
  listThread,
  restoreComment,
} from "../comments";

async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const u = { ana: randomUUID(), bea: randomUUID(), cy: randomUUID(), out: randomUUID() };
  await asService(d, (tx) =>
    tx.insert(users).values([
      { id: u.ana, displayName: "Ana" },
      { id: u.bea, displayName: "Bea", phone: "+15550001111" },
      { id: u.cy, displayName: "Cy" },
      { id: u.out, displayName: "Outsider" },
    ]),
  );
  const t = await createTrip(d, { userId: u.ana, ownerName: "Ana", name: "Lisbon", city: "Lisbon" });
  const ids = await asService(d, async (tx) => {
    const [bea, cy] = await tx
      .insert(members)
      .values([
        { tripId: t.tripId, userId: u.bea, displayName: "Bea", status: "active" },
        { tripId: t.tripId, userId: u.cy, displayName: "Cy", status: "active" },
      ])
      .returning({ id: members.id });
    const [a, b] = await tx
      .insert(ideas)
      .values([
        { tripId: t.tripId, stopId: t.stopId, title: "Time Out Market", extraction: "resolved" },
        { tripId: t.tripId, stopId: t.stopId, title: "Fado night", extraction: "resolved" },
      ])
      .returning({ id: ideas.id });
    return { bea: bea!.id, cy: cy!.id, ideaA: a!.id, ideaB: b!.id };
  });
  return { d, u, ...t, ...ids };
}

const ana = (s: { u: { ana: string } }) => ({ sub: s.u.ana });
const bea = (s: { u: { bea: string } }) => ({ sub: s.u.bea });
const cy = (s: { u: { cy: string } }) => ({ sub: s.u.cy });

describe("comment threads (FR-46)", () => {
  it("orders top-level oldest first with replies nested under their parent", async () => {
    const s = await setup();
    const c1 = await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "  Book ahead?  " });
    const c2 = await addComment(s.d, bea(s), { ideaId: s.ideaA, body: "Lunch day 2" });
    const r1 = await addComment(s.d, cy(s), { ideaId: s.ideaA, body: "Yes, the line is long", parentId: c1.id });
    const r2 = await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "Ok will do", parentId: c1.id });
    expect(c1.body).toBe("Book ahead?");
    expect(c1.isMine).toBe(true);

    const thread = (await listThread(s.d, bea(s), s.ideaA))!;
    expect(thread.map((c) => c.id)).toEqual([c1.id, c2.id]);
    expect(thread[0]!.replies.map((r) => r.id)).toEqual([r1.id, r2.id]);
    expect(thread[0]!.authorName).toBe("Ana");
    expect(thread[0]!.isMine).toBe(false);
    expect(thread[1]!.isMine).toBe(true);
    expect(thread[0]!.replies[0]!.authorName).toBe("Cy");
    // Names only, never phones.
    expect(JSON.stringify(thread)).not.toContain("+1555");
  });

  it("allows one level of nesting only, on the same idea", async () => {
    const s = await setup();
    const c1 = await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "Top" });
    const r1 = await addComment(s.d, bea(s), { ideaId: s.ideaA, body: "Reply", parentId: c1.id });
    await expect(addComment(s.d, cy(s), { ideaId: s.ideaA, body: "Nested", parentId: r1.id })).rejects.toThrow();
    await expect(addComment(s.d, cy(s), { ideaId: s.ideaB, body: "Wrong idea", parentId: c1.id })).rejects.toThrow();
  });

  it("rejects empty or huge comments", async () => {
    const s = await setup();
    await expect(addComment(s.d, ana(s), { ideaId: s.ideaA, body: "   \n " })).rejects.toBeInstanceOf(CommentError);
    await expect(addComment(s.d, ana(s), { ideaId: s.ideaA, body: "x".repeat(2001) })).rejects.toBeInstanceOf(CommentError);
    expect(cleanBody("a\r\n\n\n\n\nb‮")).toBe("a\n\nb");
  });

  it("only the author edits or deletes; organizers can't rewrite others' words", async () => {
    const s = await setup();
    const c = await addComment(s.d, bea(s), { ideaId: s.ideaA, body: "Original" });
    await expect(editComment(s.d, cy(s), { commentId: c.id, body: "Hacked" })).rejects.toThrow();
    await expect(editComment(s.d, ana(s), { commentId: c.id, body: "Owner hack" })).rejects.toThrow(); // Ana is owner
    await expect(deleteComment(s.d, cy(s), { commentId: c.id })).rejects.toThrow();
    await expect(deleteComment(s.d, ana(s), { commentId: c.id })).rejects.toThrow();
    // Direct SQL as Cy can't sneak past either (RLS + trigger).
    await expect(
      withSession(s.d, cy(s), (tx) => tx.update(comments).set({ body: "sql hack" }).where(eq(comments.id, c.id)).returning()),
    ).resolves.toEqual([]);

    await editComment(s.d, bea(s), { commentId: c.id, body: "Edited" });
    const [view] = (await listThread(s.d, cy(s), s.ideaA))!;
    expect(view!.body).toBe("Edited");
    expect(view!.edited).toBe(true);
  });

  it("soft delete: placeholder only while it has replies; body is gone from the DB; undo restores", async () => {
    const s = await setup();
    const top = await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "Secret-ish thought" });
    const lone = await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "Lonely" });
    await addComment(s.d, bea(s), { ideaId: s.ideaA, body: "Replying", parentId: top.id });

    await deleteComment(s.d, ana(s), { commentId: top.id });
    await deleteComment(s.d, ana(s), { commentId: lone.id });
    let thread = (await listThread(s.d, cy(s), s.ideaA))!;
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({ id: top.id, deleted: true, body: null });
    expect(thread[0]!.replies).toHaveLength(1);
    const raw = await withSession(s.d, cy(s), (tx) => tx.select().from(comments).where(eq(comments.id, top.id)));
    expect(raw[0]!.body).toBe("");
    // No replies under a deleted comment.
    await expect(addComment(s.d, cy(s), { ideaId: s.ideaA, body: "late", parentId: top.id })).rejects.toThrow();

    await restoreComment(s.d, ana(s), { commentId: lone.id, body: "Lonely" });
    thread = (await listThread(s.d, cy(s), s.ideaA))!;
    expect(thread.map((c) => c.body)).toEqual([null, "Lonely"]);
    expect(thread[1]!.edited).toBe(false);
  });

  it("counts only live comments the caller can see", async () => {
    const s = await setup();
    const c = await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "one" });
    await addComment(s.d, bea(s), { ideaId: s.ideaA, body: "two", parentId: c.id });
    const gone = await addComment(s.d, bea(s), { ideaId: s.ideaB, body: "three" });
    await deleteComment(s.d, bea(s), { commentId: gone.id });
    const counts = await commentCounts(s.d, cy(s), [s.ideaA, s.ideaB]);
    expect(counts.get(s.ideaA)).toBe(2);
    expect(counts.get(s.ideaB)).toBeUndefined();
    const view = await getTripView(s.d, cy(s), s.tripId);
    expect(view!.ideas.find((i) => i.id === s.ideaA)!.commentCount).toBe(2);
    expect(view!.ideas.find((i) => i.id === s.ideaB)!.commentCount).toBe(0);
    // Outsiders see nothing.
    expect((await commentCounts(s.d, { sub: s.u.out }, [s.ideaA])).size).toBe(0);
    expect(await listThread(s.d, { sub: s.u.out }, s.ideaA)).toBeNull();
  });

  it("surprise ideas: hidden members can't see comments, counts or threads (FR-91)", async () => {
    const s = await setup();
    await setBachMode(s.d, ana(s), { tripId: s.tripId, on: true });
    await setGuestOfHonor(s.d, ana(s), { tripId: s.tripId, memberId: s.bea, on: true });
    const before = await addComment(s.d, cy(s), { ideaId: s.ideaA, body: "before hiding" });
    await setIdeaHiddenFrom(s.d, ana(s), { ideaId: s.ideaA, memberIds: [s.bea] });
    const after = await addComment(s.d, cy(s), { ideaId: s.ideaA, body: "after hiding" });

    expect(await listThread(s.d, bea(s), s.ideaA)).toBeNull();
    expect((await commentCounts(s.d, bea(s), [s.ideaA])).size).toBe(0);
    const raw = await withSession(s.d, bea(s), (tx) => tx.select().from(comments));
    expect(raw).toEqual([]);
    await expect(addComment(s.d, bea(s), { ideaId: s.ideaA, body: "peek" })).rejects.toThrow();
    // New comments inherit the idea's surprise list.
    const [row] = await asService(s.d, (tx) => tx.select().from(comments).where(eq(comments.id, after.id)));
    expect(row!.hiddenFrom).toEqual([s.bea]);
    // Others still see the whole thread.
    expect((await listThread(s.d, cy(s), s.ideaA))!.map((c) => c.id)).toEqual([before.id, after.id]);
  });

  it("personal-link sessions can read threads but not write (FR-5)", async () => {
    const s = await setup();
    await addComment(s.d, ana(s), { ideaId: s.ideaA, body: "hello" });
    const link = { link_member: s.cy };
    expect((await listThread(s.d, link, s.ideaA))!).toHaveLength(1);
    await expect(addComment(s.d, link, { ideaId: s.ideaA, body: "hi" })).rejects.toMatchObject({ code: "signin_required" });
    // Even straight SQL is refused by RLS.
    await expect(
      withSession(s.d, link, (tx) =>
        tx.insert(comments).values({ tripId: s.tripId, ideaId: s.ideaA, memberId: s.cy, body: "sneaky" }),
      ),
    ).rejects.toThrow();
  });
});
