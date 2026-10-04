/**
 * POST a screenshot to the caller's own library (FR-L1). Multipart: `file`, optional `note`.
 * Any device session works for a private library (P1); with none yet, a zero-setup device user
 * is created, like saving a pasted link.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@wandr/db";
import { EVENTS } from "@/inngest/client";
import { getSession } from "@/lib/auth/session";
import { MAX_SCREENSHOT_BYTES } from "@/lib/storage/screenshots";
import { IdeaInputError } from "@/server/ideas";
import { enqueue } from "@/server/jobs";
import { saveScreenshot } from "@/server/library";

export const maxDuration = 60;

const TOO_BIG = "That image is too large (10 MB max).";

export async function POST(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_SCREENSHOT_BYTES + 64 * 1024) {
      return NextResponse.json({ error: TOO_BIG }, { status: 413, headers: noStore });
    }
    const form = await req.formData();
    const file = form.get("file");
    const note = form.get("note");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400, headers: noStore });
    if (file.size > MAX_SCREENSHOT_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 413, headers: noStore });

    const db = await getDb();
    const session = await getSession();
    // D74: saves belong to a verified number; no anonymous libraries.
    if (!session.user || session.user.provisional) {
      return NextResponse.json({ ok: false, error: "Sign up with your number first." }, { status: 401, headers: noStore });
    }
    const userId = session.user.userId;
    const { savedIdeaId } = await saveScreenshot(db, userId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      note: typeof note === "string" ? note : undefined,
    });
    await enqueue({ name: EVENTS.savedIdeaAdded, data: { savedIdeaId } });
    return NextResponse.json({ ok: true, savedIdeaId }, { headers: noStore });
  } catch (e) {
    if (e instanceof IdeaInputError) {
      return NextResponse.json({ error: e.message === e.code ? "That didn't work." : e.message }, { status: 400, headers: noStore });
    }
    console.error(e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500, headers: noStore });
  }
}
