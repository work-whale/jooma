// Finds a relevant YouTube video for a lesson topic.
//
// Flow:
//   1. Ask gpt-4o for a focused search query + a list of channels we'd trust
//      for this topic (so we bias toward educational channels).
//   2. Call YouTube Data API v3 `search.list` with that query.
//   3. Return the top hit's id + title + duration.
//
// Requires YOUTUBE_API_KEY in env.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { recordUsage } from "@/app/lib/usage";

export const maxDuration = 30;

type Length = "short" | "medium" | "long" | "any";

interface RequestBody {
  topic: string;
  year?: string;
  readingLevel?: string;
  length?: Length;
  /** Deck title — passed in from the editor so the search can be biased
   *  toward the actual presentation rather than just the raw topic keyword. */
  deckTitle?: string;
  /** Up to ~8 slide titles for additional context. Helps the AI understand
   *  the angle of the lesson when picking a search query. */
  slideTitles?: string[];
  /** Free-text steering from the user (e.g. "focus on real-world examples"
   *  or "should feature an interview"). Injected verbatim into the GPT prompt
   *  so the search query reflects the user's intent. */
  extraInstructions?: string;
}

interface SearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { medium?: { url: string }; high?: { url: string } };
  };
}

interface VideoStatusItem {
  id: string;
  status?: { uploadStatus?: string; privacyStatus?: string; embeddable?: boolean };
  contentDetails?: { regionRestriction?: { blocked?: string[]; allowed?: string[] } };
}

// Verify which of the given video ids will actually play in a third-party
// embed. `search.list` can't tell us this, so we confirm via
// `videos.list?part=status,contentDetails` and keep only ids that are
// embeddable, public, finished processing, and not region-blocked for the
// viewer (when their region is known). Returns the playable subset; on any API
// failure returns an empty set so the caller can fall back gracefully.
async function fetchPlayableIds(ids: string[], key: string, viewerRegion: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  try {
    const params = new URLSearchParams({ part: "status,contentDetails", id: ids.join(","), key });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
    if (!r.ok) return out;
    const data: { items?: VideoStatusItem[] } = await r.json();
    for (const it of data.items ?? []) {
      const s = it.status;
      if (!s?.embeddable) continue;
      if (s.privacyStatus !== "public") continue;
      if (s.uploadStatus && s.uploadStatus !== "processed") continue;
      const region = it.contentDetails?.regionRestriction;
      if (region && viewerRegion) {
        if (region.blocked?.includes(viewerRegion)) continue;
        if (region.allowed && !region.allowed.includes(viewerRegion)) continue;
      }
      out.add(it.id);
    }
  } catch (err) {
    console.warn("[find-youtube] videos.list playability check failed:", err);
  }
  return out;
}

const querySchema = {
  name: "yt_query",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["query", "slideHeading", "slideSubtitle"],
    properties: {
      query: { type: "string" },
      // Short ALL-CAPS slide title, e.g. "WATCH: READING BETWEEN THE LINES".
      // Used as the heading on the dedicated video slide.
      slideHeading: { type: "string" },
      // One-sentence intro that sets up why pupils are watching.
      slideSubtitle: { type: "string" },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json({
      error: "YOUTUBE_API_KEY not set",
      hint: "Add YOUTUBE_API_KEY to .env.local from console.cloud.google.com → YouTube Data API v3",
    }, { status: 503 });
  }

  // 1) Ask gpt-4o for a focused, educational search query.
  const client = getOpenAI();
  const yearLine = body.year ? `Audience: UK ${body.year} pupils.` : "";
  const deckLine = body.deckTitle?.trim()
    ? `The lesson is titled "${body.deckTitle.trim()}".`
    : "";
  const slideLine = body.slideTitles?.length
    ? `The deck covers these aspects: ${body.slideTitles
        .filter((s) => !!s?.trim())
        .slice(0, 8)
        .map((s) => `"${s.trim()}"`)
        .join(", ")}.`
    : "";
  const instructionsLine = body.extraInstructions?.trim()
    ? `Additional steering from the teacher: ${body.extraInstructions.trim()}`
    : "";
  const prompt = `For a classroom lesson on: "${body.topic}".

${deckLine}
${slideLine}
${yearLine}
${instructionsLine}

Return three things:
1. "query" — a focused YouTube search query (4-8 words, no quotes). Aim for educational channels (BBC Bitesize, CrashCourse, Kurzgesagt, TED-Ed, etc.). The query MUST tie to the lesson title above, not just the broad topic, so the result is actually relevant to what the presentation covers. NEVER include "shorts", "tiktok", or "reel".
2. "slideHeading" — a short ALL-CAPS slide title that previews the video, e.g. "WATCH: READING BETWEEN THE LINES" or "WATCH: HOW VOLCANOES ERUPT". Start with "WATCH:" and keep the whole heading under 40 characters so it fits on one line.
3. "slideSubtitle" — one warm, classroom-friendly sentence that introduces why pupils are watching. Under 90 characters. Example: "Let's see how inference works in action with some helpful tips!"`;
  let searchQuery = body.topic;
  let slideHeading = `WATCH: ${body.topic.toUpperCase()}`;
  let slideSubtitle = "Let's watch this together to deepen our understanding.";
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You design UK classroom lessons. Return concise JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: querySchema },
    });
    // Record the query-refinement cost. When the slideshow calls this
    // (parentTool set), attribute it to the slideshow's breakdown.
    const parentTool = (body as { parentTool?: string }).parentTool;
    void recordUsage(parentTool ?? "find-youtube", "gpt-4o-2024-08-06", completion.usage, parentTool ? "YouTube" : null);
    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed: { query: string; slideHeading: string; slideSubtitle: string } = JSON.parse(content);
      if (parsed.query?.trim()) searchQuery = parsed.query.trim();
      if (parsed.slideHeading?.trim()) slideHeading = parsed.slideHeading.trim();
      if (parsed.slideSubtitle?.trim()) slideSubtitle = parsed.slideSubtitle.trim();
    }
  } catch (err) {
    // Fall through to using the raw topic.
    console.warn("[find-youtube] gpt-4o query refinement failed:", err);
  }

  // 2) YouTube Data API search.
  // Bias against Shorts: append `-shorts -tiktok` to the query (excludes
  // anything explicitly tagged a Short) AND force `videoDuration=medium`
  // when no preference is supplied — Shorts are always under 60s, so
  // requiring 4-20 minutes filters them out at the API level.
  const finalQuery = `${searchQuery} -shorts -tiktok -reel`;
  const params = new URLSearchParams({
    part: "snippet",
    q: finalQuery,
    type: "video",
    // Over-fetch: many results aren't embeddable (owner disabled it) or are
    // region-blocked. We filter those out below, so ask for extra headroom.
    maxResults: "12",
    safeSearch: "strict",
    relevanceLanguage: "en",
    // Only surface videos that are embeddable on a third-party site. This is the
    // single biggest cause of the player's "An error occurred (Playback ID …)".
    videoEmbeddable: "true",
    key,
  });
  const len = body.length ?? "medium";
  if (len !== "any") params.set("videoDuration", len);

  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    return NextResponse.json({ error: "YouTube API error", status: r.status, message: err }, { status: 502 });
  }
  const data: { items?: SearchItem[] } = await r.json();
  let items = (data.items ?? []).filter((it) => !!it?.id?.videoId);
  if (items.length === 0) {
    return NextResponse.json({ error: "No video found", query: searchQuery }, { status: 404 });
  }

  // `search.list?videoEmbeddable=true` is a coarse filter — it can still return
  // videos that are region-blocked, unlisted/private, or not finished
  // processing, all of which fail in the embed. Confirm playability with a
  // `videos.list?part=status,contentDetails` follow-up and keep only the ones
  // that will actually play in the iframe (for the viewer's region when known).
  const viewerRegion = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
  const playableIds = await fetchPlayableIds(items.map((it) => it.id.videoId), key, viewerRegion);
  if (playableIds.size > 0) {
    // Preserve YouTube's relevance order; just drop the unplayable ones.
    items = items.filter((it) => playableIds.has(it.id.videoId));
  } else {
    // None verified playable (videos.list failed or every hit is restricted).
    // Fall back to the embeddable-flagged results rather than 404 — the user
    // can still swap via the regenerate picker.
    console.warn("[find-youtube] no videos verified playable; using unverified results", { query: searchQuery, viewerRegion });
  }

  // Up to 5 candidates so the client can present them as a selectable list.
  const candidates = items.slice(0, 5).map((it) => ({
    videoId: it.id.videoId,
    title: it.snippet.title,
    channel: it.snippet.channelTitle,
    description: it.snippet.description,
    thumbnail: it.snippet.thumbnails?.high?.url ?? it.snippet.thumbnails?.medium?.url ?? null,
  }));

  // Keep the legacy single-pick fields on the top hit so existing callers
  // (the generate-slideshow flow) still work without a code change.
  const top = candidates[0];

  return NextResponse.json({
    videoId: top.videoId,
    title: top.title,
    channel: top.channel,
    description: top.description,
    thumbnail: top.thumbnail,
    query: searchQuery,
    slideHeading,
    slideSubtitle,
    candidates,
  });
}
