// Pull the video id out of any reasonable YouTube URL the user might paste.
// Supports:
//   https://www.youtube.com/watch?v=ID
//   https://youtu.be/ID
//   https://www.youtube.com/embed/ID
//   https://www.youtube.com/shorts/ID
//   Plain video IDs (11 chars, [A-Za-z0-9_-])
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Plain ID
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  let u: URL;
  try { u = new URL(raw); } catch { return null; }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host.endsWith(".youtube.com")) {
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
    }
    const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  return null;
}

export function youtubeEmbedUrl(id: string, opts?: { start?: number; end?: number; autoplay?: boolean }): string {
  const params = new URLSearchParams();
  params.set("rel", "0");
  params.set("modestbranding", "1");
  if (opts?.start) params.set("start", String(opts.start));
  if (opts?.end) params.set("end", String(opts.end));
  if (opts?.autoplay) params.set("autoplay", "1");
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
