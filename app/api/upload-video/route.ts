// Accept a multipart video upload from the editor's Video sidebar tab, push it
// to the Supabase Storage `video` bucket, return the public URL.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const maxDuration = 60;

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB cap

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (50 MB limit)" }, { status: 413 });
  }
  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "Not a video file" }, { status: 415 });
  }

  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || "mp4"}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("video")
    .upload(filename, buf, { contentType: file.type, upsert: false });
  if (error) {
    return NextResponse.json({ error: "Storage upload failed", message: error.message }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from("video").getPublicUrl(filename);
  return NextResponse.json({ src: pub.publicUrl });
}
