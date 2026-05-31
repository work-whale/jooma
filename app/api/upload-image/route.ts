// Stores a client-provided image (base64 data URL) in Supabase Storage and
// returns its public URL. Keeps large blobs — like background-removed
// transparent PNGs produced client-side — out of the slide JSON / Postgres.

import { NextRequest, NextResponse } from "next/server";
import { uploadDataUrlToStorage } from "@/app/lib/imageStorage";

export const maxDuration = 30;

interface RequestBody {
  dataUrl: string;
  filenameHint?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.dataUrl?.trim()) {
    return NextResponse.json({ error: "Missing dataUrl" }, { status: 400 });
  }

  try {
    const url = await uploadDataUrlToStorage(body.dataUrl, body.filenameHint);
    if (!url) {
      return NextResponse.json({ error: "Input is not a valid image data URL" }, { status: 400 });
    }
    return NextResponse.json({ src: url });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Storage upload failed", message: e?.message }, { status: 500 });
  }
}
