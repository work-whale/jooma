// The pictures on a signed out visitor's free worksheet or comprehension.
//
// A guest's sheet is stored when its text finishes (the onComplete in
// /api/try/worksheet and /api/try/comprehension), and their edits on /create
// are never stored, so the pictures are found here, on the server, and written
// into that stored sheet. The sheet they claim on sign up then has them too.
//
// Web pictures only, whatever the page asks for: AI pictures come with a
// subscription. Only the visitor's own run (by the signed cookie), only a
// finished one, at most the sheet's three pictures, and only frames still
// empty, so a repeated call finds nothing new to fetch. A per IP brake covers
// the rest.

import { NextResponse } from "next/server";
import { clientIp, getGuestRun, guestCallAllowed, readGuestId, updateGuestRunOutput } from "@/app/lib/guest";
import { searchPixabay } from "@/app/lib/slideshow-pipeline";
import { parseSheet, serializeSheet, sheetImages } from "@/app/lib/sheets/normalize";
import { needsPicture, placePicture } from "@/app/lib/sheets/picture-fill";

export const maxDuration = 60;

const PER_HOUR = 20;
const SHEET_TOOLS = new Set(["worksheet-generator", "comprehension-generator"]);

/** The stored run, waiting briefly when the text has streamed but onComplete
 *  has not finished writing it yet. */
async function finishedRun(guestId: string, id: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const run = await getGuestRun(guestId, id);
    if (!run || run.status === "failed") return null;
    if (run.status === "done") return run;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export async function POST(req: Request) {
  let body: { trialId?: string };
  try {
    body = (await req.json()) as { trialId?: string };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const guestId = await readGuestId();
  if (!guestId || typeof body.trialId !== "string") {
    return NextResponse.json({ error: "Nothing to add pictures to." }, { status: 404 });
  }
  if (!(await guestCallAllowed(clientIp(req), "guest_helper_ip", PER_HOUR))) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const run = await finishedRun(guestId, body.trialId);
  const stored = run && SHEET_TOOLS.has(run.tool) ? (run.output as { text?: unknown } | null)?.text : null;
  const doc = typeof stored === "string" ? parseSheet(stored) : null;
  if (!run || !doc) return NextResponse.json({ error: "Nothing to add pictures to." }, { status: 404 });

  const missing = sheetImages(doc).filter(needsPicture);
  if (missing.length === 0) return NextResponse.json({ sheet: serializeSheet(doc) });

  const found = await Promise.all(
    missing.map(async (img) => {
      const hit = await searchPixabay(img.query, "landscape").catch(() => null);
      return { id: img.id, pick: hit ? { src: hit.dataUrl, width: hit.width, height: hit.height, source: "web" as const } : null };
    }),
  );
  const filled = serializeSheet(found.reduce((d, f) => placePicture(d, f.id, f.pick), doc));
  if (found.some((f) => f.pick)) {
    await updateGuestRunOutput(guestId, run.id, { ...(run.output ?? {}), text: filled });
  }
  return NextResponse.json({ sheet: filled });
}
