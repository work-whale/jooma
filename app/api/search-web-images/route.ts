// Web image search via Google Programmable Search Engine (Custom Search JSON
// API, searchType=image). Proxied through the server so the API key stays
// server-side and we can enforce SafeSearch. The returned `full` URL points at
// our /api/proxy-image so arbitrary cross-origin/expiring source images embed
// reliably (client fetch of a random domain usually fails CORS).
//
// Requires:
//   GOOGLE_CSE_KEY              (secret, server-only)
//   NEXT_PUBLIC_GOOGLE_CSE_CX   (the search-engine id — not secret; also gates
//                                the "Web" tab's visibility on the client)

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface CseItem {
  title?: string;
  link?: string;
  image?: { thumbnailLink?: string; contextLink?: string; width?: number; height?: number };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const num = Math.min(10, Math.max(1, parseInt(req.nextUrl.searchParams.get("num") || "7", 10) || 7));
  // Optional reuse-rights filter, e.g. "cc_publicdomain|cc_attribute|cc_sharealike".
  const rights = req.nextUrl.searchParams.get("rights")?.trim();
  if (!q) return NextResponse.json({ photos: [] });

  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.NEXT_PUBLIC_GOOGLE_CSE_CX;
  if (!key || !cx) {
    return NextResponse.json(
      { error: "Google image search isn't configured", hint: "Set GOOGLE_CSE_KEY and NEXT_PUBLIC_GOOGLE_CSE_CX" },
      { status: 503 },
    );
  }

  // CSE `start` is 1-based; the API only serves results 1-100.
  const start = Math.min(100 - num + 1, (page - 1) * num + 1);
  const params = new URLSearchParams({
    key, cx, q, searchType: "image", safe: "active", num: String(num), start: String(start),
  });
  if (rights) params.set("rights", rights);

  const r = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
  if (!r.ok) {
    const message = await r.text().catch(() => "");
    console.error("[search-web-images] Google CSE error", { status: r.status, message });
    return NextResponse.json({ error: "Google image search failed", status: r.status, message }, { status: 502 });
  }
  const data = (await r.json()) as { items?: CseItem[] };
  const photos = (data.items ?? [])
    .filter((it) => !!it.link)
    .map((it, i) => ({
      id: `web-${start}-${i}`,
      provider: "web" as const,
      thumb: it.image?.thumbnailLink || it.link!,
      full: `/api/proxy-image?url=${encodeURIComponent(it.link!)}`,
      alt: it.title ?? "",
      sourceUrl: it.image?.contextLink,
    }));
  return NextResponse.json({ photos });
}
