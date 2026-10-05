// Looks up a single YouTube video the teacher pasted a link to.
//
// The slideshow generator no longer searches for a video: teachers paste their
// own link, so a human has vetted what plays in a lesson. This route confirms
// they pasted the right thing (title, channel, thumbnail) and, more usefully,
// catches a video that will never play in an embed BEFORE the deck is built
// rather than after.
//
// No model call, so nothing to record in token_usage and nothing to charge.
//
// Requires YOUTUBE_API_KEY in env.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { readGuestId } from "@/app/lib/guest";

export const maxDuration = 15;

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url: string }; high?: { url: string }; default?: { url: string } };
  };
  status?: { uploadStatus?: string; privacyStatus?: string; embeddable?: boolean };
  contentDetails?: { duration?: string; regionRestriction?: { blocked?: string[]; allowed?: string[] } };
}

// ISO 8601 ("PT4M12S") into something a teacher reads ("4:12"). YouTube only
// ever returns hours/minutes/seconds here, so no need for a general parser.
function formatDuration(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const [h, min, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // A guest finishing a deck on /create may paste a link too. The proxy has
  // already checked their cookie and throttled them; this is the same check
  // again, because this route also guards itself.
  if (!user && !(await readGuestId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return NextResponse.json({ error: "That does not look like a YouTube link." }, { status: 400 });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json({
      error: "YOUTUBE_API_KEY not set",
      hint: "Add YOUTUBE_API_KEY to .env.local from console.cloud.google.com, YouTube Data API v3",
    }, { status: 503 });
  }

  const params = new URLSearchParams({ part: "snippet,status,contentDetails", id, key });
  let data: { items?: VideoItem[] };
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
    if (!r.ok) {
      const message = await r.text().catch(() => "");
      console.error("[lookup-youtube] videos.list failed", { status: r.status, message });
      return NextResponse.json({ error: "We could not reach YouTube. Try again in a moment." }, { status: 502 });
    }
    data = await r.json();
  } catch (err) {
    console.error("[lookup-youtube] videos.list threw:", err);
    return NextResponse.json({ error: "We could not reach YouTube. Try again in a moment." }, { status: 502 });
  }

  const item = data.items?.[0];
  if (!item) {
    return NextResponse.json({ error: "That video does not exist, or it is private." }, { status: 404 });
  }

  // Same playability rules the search path applies (see fetchPlayableIds in
  // /api/find-youtube): embeddable, public, finished processing, and not
  // blocked in the viewer's region. Each gets its own message so the teacher
  // knows whether to find another video or just wait.
  const status = item.status;
  if (status?.privacyStatus && status.privacyStatus !== "public") {
    return NextResponse.json({ error: "That video is not public, so it cannot play in a slideshow." }, { status: 422 });
  }
  if (status?.uploadStatus && status.uploadStatus !== "processed") {
    return NextResponse.json({ error: "YouTube is still processing that video. Try again shortly." }, { status: 422 });
  }
  if (!status?.embeddable) {
    return NextResponse.json({ error: "The owner does not allow this video to play outside YouTube." }, { status: 422 });
  }
  const viewerRegion = req.headers.get("x-vercel-ip-country") ?? "";
  const region = item.contentDetails?.regionRestriction;
  if (region && viewerRegion) {
    const blocked = region.blocked?.includes(viewerRegion);
    const notAllowed = region.allowed && !region.allowed.includes(viewerRegion);
    if (blocked || notAllowed) {
      return NextResponse.json({ error: "That video is not available in your country." }, { status: 422 });
    }
  }

  const thumbs = item.snippet?.thumbnails;
  return NextResponse.json({
    videoId: item.id,
    title: item.snippet?.title ?? "",
    channel: item.snippet?.channelTitle ?? "",
    thumbnail: thumbs?.medium?.url ?? thumbs?.high?.url ?? thumbs?.default?.url ?? "",
    duration: formatDuration(item.contentDetails?.duration),
  });
}
