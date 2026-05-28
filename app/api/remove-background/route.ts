// Removes the background from an image using OpenAI's gpt-image-1 edit endpoint.
// Accepts { src } — a public URL or base64 data URL — and returns { src } with a
// Supabase Storage public URL pointing at the resulting transparent PNG.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { supabase } from "@/app/lib/supabase";
import { toFile } from "openai";

export const maxDuration = 120;

interface RequestBody {
  src: string;
}

async function srcToBuffer(src: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;,]+);base64,(.+)$/i.exec(src);
    if (!m) throw new Error("Invalid data URL");
    return {
      bytes: new Uint8Array(Buffer.from(m[2], "base64")),
      mime: m[1],
    };
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const mime = res.headers.get("content-type") ?? "image/png";
  return { bytes: new Uint8Array(buf), mime };
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.src?.trim()) {
    return NextResponse.json({ error: "Missing src" }, { status: 400 });
  }

  let imageBytes: Uint8Array;
  let imageMime: string;
  try {
    ({ bytes: imageBytes, mime: imageMime } = await srcToBuffer(body.src));
  } catch (e) {
    return NextResponse.json({ error: "Failed to load image", message: String(e) }, { status: 400 });
  }

  const client = getOpenAI();

  // OpenAI images.edit requires a PNG for the image input.
  // If the source is already PNG we pass it directly; otherwise we rely on the
  // API accepting JPEG/WebP too (gpt-image-1 is lenient about input format).
  const ext = imageMime.includes("png") ? "png" : imageMime.includes("webp") ? "webp" : "jpg";
  const imageFile = await toFile(Buffer.from(imageBytes), `image.${ext}`, { type: imageMime });

  let resultBytes: Uint8Array;
  try {
    const response = await client.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: "Remove the background completely. Make the background fully transparent. Keep the foreground subject exactly as-is — no changes to the subject.",
      n: 1,
      size: "1024x1024",
    });

    const item = response.data?.[0];
    if (!item) throw new Error("Empty response from OpenAI");

    if (item.b64_json) {
      resultBytes = new Uint8Array(Buffer.from(item.b64_json, "base64"));
    } else if (item.url) {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) throw new Error("Failed to fetch result image");
      resultBytes = new Uint8Array(await imgRes.arrayBuffer());
    } else {
      throw new Error("No image data in response");
    }
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: "OpenAI edit failed", message: e.message }, { status: 500 });
  }

  // Upload the resulting transparent PNG to Supabase Storage.
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_rembg.png`;
  const { error: uploadErr } = await supabase.storage
    .from("images")
    .upload(filename, resultBytes, { contentType: "image/png", upsert: false });
  if (uploadErr) {
    return NextResponse.json({ error: "Storage upload failed", message: uploadErr.message }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from("images").getPublicUrl(filename);

  return NextResponse.json({ src: pub.publicUrl });
}
