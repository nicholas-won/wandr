/**
 * POST a screenshot as a trip idea (FR-20). Multipart: `file` (the image), optional `note`.
 * Adding ideas needs a verified member (FR-5). The card appears at once; the background job
 * reads the on-screen text (FR-23, FR-30).
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { EVENTS } from "@/inngest/client";
import { getSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { MAX_SCREENSHOT_BYTES } from "@/lib/storage/screenshots";
import { track } from "@/server/analytics";
import { tripContext } from "@/server/context";
import { addScreenshotIdea, IdeaInputError } from "@/server/ideas";
import { enqueue } from "@/server/jobs";

export const maxDuration = 60;

const TOO_BIG = "That image is too large (10 MB max).";

export async function POST(req: NextRequest, ctx: RouteContext<"/t/[tripId]/screenshot">) {
  const { tripId } = await ctx.params;
  const noStore = { "Cache-Control": "no-store" };
  try {
    const session = await getSession();
    if (!session.user) {
      return NextResponse.json(
        { error: "Confirm your number to add ideas.", signin: routes.signin(routes.trip(tripId)) },
        { status: 401, headers: noStore },
      );
    }
    if (Number(req.headers.get("content-length") ?? 0) > MAX_SCREENSHOT_BYTES + 64 * 1024) {
      return NextResponse.json({ error: TOO_BIG }, { status: 413, headers: noStore });
    }
    const form = await req.formData();
    const file = form.get("file");
    const note = form.get("note");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400, headers: noStore });
    if (file.size > MAX_SCREENSHOT_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 413, headers: noStore });
    const { db, claims } = await tripContext(tripId);
    const { ideaId } = await addScreenshotIdea(db, claims, {
      tripId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      note: typeof note === "string" ? note : undefined,
    });
    await enqueue({ name: EVENTS.ideaAdded, data: { ideaId } });
    after(() => track(db, { name: "idea_added", tripId, props: { ideaId, via: "screenshot" } }));
    return NextResponse.json({ ok: true, ideaId }, { headers: noStore });
  } catch (e) {
    if (e instanceof IdeaInputError) {
      const status = e.code === "not_found" ? 404 : e.code === "signin" ? 401 : 400;
      return NextResponse.json({ error: e.message === e.code ? "That didn't work." : e.message }, { status, headers: noStore });
    }
    console.error(e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500, headers: noStore });
  }
}
