// Server-side image fetch proxy. The browser can't reliably fetch arbitrary
// image URLs (CORS) so the editor's "Add by URL" feature hits this route,
// which fetches the bytes server-side and returns a data URL.

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB cap to avoid blowing slide JSON

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const raw = body.url?.trim();
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  try {
    const r = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 Jooma" },
      redirect: "follow",
    });
    if (!r.ok) {
      return NextResponse.json({ error: `Source returned ${r.status}` }, { status: 502 });
    }
    const contentType = r.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "URL is not an image" }, { status: 415 });
    }
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (12MB limit)" }, { status: 413 });
    }
    const b64 = Buffer.from(buf).toString("base64");
    return NextResponse.json({ dataUrl: `data:${contentType};base64,${b64}` });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? "Fetch failed" }, { status: 502 });
  }
}
