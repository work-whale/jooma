// Server-side image fetch proxy. Used by the "Web" image search so arbitrary
// cross-origin source images can be embedded into a slide (a direct client
// fetch of a random domain usually fails CORS, and web image URLs rot/expire).
// Returns the raw image bytes from our own origin, so the client's
// fetch -> blob -> dataURL conversion just works.
//
// Hardening: http(s) only, image content-types only, ~10 MB cap, and a basic
// block on localhost / private network ranges to limit SSRF.

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 private / loopback / link-local ranges.
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // IPv6 loopback / unique-local.
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try { target = new URL(url); } catch { return NextResponse.json({ error: "Invalid url" }, { status: 400 }); }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 });
  }

  let r: Response;
  try {
    r = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JoomaBot/1.0)", Accept: "image/*" },
      redirect: "follow",
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
  if (!r.ok) return NextResponse.json({ error: "Upstream error", status: r.status }, { status: 502 });

  const contentType = r.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
