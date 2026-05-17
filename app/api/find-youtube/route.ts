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

export const maxDuration = 30;

type Length = "short" | "medium" | "long" | "any";

interface RequestBody {
  topic: string;
  year?: string;
  readingLevel?: string;
  length?: Length;
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
  const prompt = `For a classroom lesson on: "${body.topic}".

${yearLine}

Return three things:
1. "query" — a focused YouTube search query (4-8 words, no quotes). Aim for educational channels (BBC Bitesize, CrashCourse, Kurzgesagt, TED-Ed, etc.).
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
  const params = new URLSearchParams({
    part: "snippet",
    q: searchQuery,
    type: "video",
    maxResults: "5",
    safeSearch: "strict",
    relevanceLanguage: "en",
    key,
  });
  const len = body.length ?? "any";
  if (len !== "any") params.set("videoDuration", len);

  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    return NextResponse.json({ error: "YouTube API error", status: r.status, message: err }, { status: 502 });
  }
  const data: { items?: SearchItem[] } = await r.json();
  const hit = data.items?.[0];
  if (!hit?.id?.videoId) {
    return NextResponse.json({ error: "No video found", query: searchQuery }, { status: 404 });
  }

  return NextResponse.json({
    videoId: hit.id.videoId,
    title: hit.snippet.title,
    channel: hit.snippet.channelTitle,
    description: hit.snippet.description,
    thumbnail: hit.snippet.thumbnails?.high?.url ?? hit.snippet.thumbnails?.medium?.url,
    query: searchQuery,
    slideHeading,
    slideSubtitle,
  });
}
