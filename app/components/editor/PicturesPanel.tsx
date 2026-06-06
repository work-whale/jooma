"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, MoreHorizontal, ExternalLink, Sparkles } from "lucide-react";
import { listGeneratedImages, thumbUrl, type GeneratedImage } from "@/app/lib/generatedImages";

interface Props {
  onAdd: (dataUrl: string) => void;
}

interface Photo {
  id: string;
  provider: Provider;
  thumb: string;
  full: string;
  alt: string;
  photographerName?: string;
  photographerUrl?: string;
  sourceUrl?: string;
  downloadLocation?: string;
}

type Provider = "pexels" | "unsplash" | "pixabay" | "giphy";

const PEXELS_KEY = process.env.NEXT_PUBLIC_PEXELS_API_KEY;
const UNSPLASH_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_KEY;
const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY;

const PROVIDER_LABELS: Record<Provider, string> = {
  pexels: "Pexels",
  unsplash: "Unsplash",
  pixabay: "Pixabay",
  giphy: "GIPHY",
};

const PROVIDER_KEYS: Record<Provider, string | undefined> = {
  pexels: PEXELS_KEY,
  unsplash: UNSPLASH_KEY,
  pixabay: PIXABAY_KEY,
  giphy: GIPHY_KEY,
};

const PROVIDER_DOCS: Record<Provider, { envVar: string; site: string }> = {
  pexels: { envVar: "NEXT_PUBLIC_PEXELS_API_KEY", site: "pexels.com/api" },
  unsplash: { envVar: "NEXT_PUBLIC_UNSPLASH_ACCESS_KEY", site: "unsplash.com/developers" },
  pixabay: { envVar: "NEXT_PUBLIC_PIXABAY_KEY", site: "pixabay.com/api/docs/" },
  giphy: { envVar: "NEXT_PUBLIC_GIPHY_KEY", site: "developers.giphy.com" },
};

const UTM = "utm_source=jooma&utm_medium=referral";

// Initial batch ~ 14 photos. With 2-3 providers configured this lands at 14-21
// (we fetch the same per-provider amount each page so subsequent loads stay balanced).
const PER_PROVIDER = 7;

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch failed");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(blob);
  });
}

interface PexelsPhoto {
  id: number;
  src: { tiny: string; medium: string; large: string };
  alt: string;
  url: string;
  photographer: string;
  photographer_url: string;
}
interface UnsplashPhoto {
  id: string;
  urls: { thumb: string; small: string; regular: string };
  alt_description: string | null;
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}
interface PixabayPhoto {
  id: number;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  pageURL: string;
  tags: string;
  user: string;
}
interface GiphyImage {
  url: string;
  width?: string;
  height?: string;
}
interface GiphyGif {
  id: string;
  title: string;
  url: string;
  username?: string;
  images: {
    fixed_height_small?: GiphyImage;
    fixed_height?: GiphyImage;
    original: GiphyImage;
  };
}

async function search(provider: Provider, query: string, page: number, signal: AbortSignal): Promise<Photo[]> {
  const key = PROVIDER_KEYS[provider];
  if (!key) return [];
  if (provider === "pexels") {
    const url = query
      ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PROVIDER}&page=${page}`
      : `https://api.pexels.com/v1/curated?per_page=${PER_PROVIDER}&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: key }, signal });
    const data: { photos?: PexelsPhoto[] } = await r.json();
    return (data.photos ?? []).map((p) => ({
      id: `pexels-${p.id}`,
      provider: "pexels" as Provider,
      thumb: p.src.tiny,
      full: p.src.large,
      alt: p.alt,
      photographerName: p.photographer,
      photographerUrl: p.photographer_url,
      sourceUrl: p.url,
    }));
  }
  if (provider === "unsplash") {
    const url = query
      ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${PER_PROVIDER}&page=${page}`
      : `https://api.unsplash.com/photos?per_page=${PER_PROVIDER}&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Client-ID ${key}` }, signal });
    const data: { results?: UnsplashPhoto[] } | UnsplashPhoto[] = await r.json();
    const list = Array.isArray(data) ? data : data.results ?? [];
    return list.map((p) => ({
      id: `unsplash-${p.id}`,
      provider: "unsplash" as Provider,
      thumb: p.urls.thumb,
      full: p.urls.regular,
      alt: p.alt_description ?? "",
      photographerName: p.user.name,
      photographerUrl: `${p.user.links.html}?${UTM}`,
      sourceUrl: `${p.links.html}?${UTM}`,
      downloadLocation: p.links.download_location,
    }));
  }
  if (provider === "pixabay") {
    const q = query || "landscape";
    const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=${PER_PROVIDER}&page=${page}&image_type=photo&safesearch=true`;
    const r = await fetch(url, { signal });
    const data: { hits?: PixabayPhoto[] } = await r.json();
    return (data.hits ?? []).map((p) => ({
      id: `pixabay-${p.id}`,
      provider: "pixabay" as Provider,
      thumb: p.previewURL,
      full: p.largeImageURL,
      alt: p.tags,
      photographerName: p.user,
      sourceUrl: p.pageURL,
    }));
  }
  if (provider === "giphy") {
    // GIPHY uses an offset, not a page. Convert: offset = (page-1) * per_page.
    const offset = (page - 1) * PER_PROVIDER;
    const endpoint = query ? "search" : "trending";
    const url = query
      ? `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${key}&q=${encodeURIComponent(query)}&limit=${PER_PROVIDER}&offset=${offset}&rating=g`
      : `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${key}&limit=${PER_PROVIDER}&offset=${offset}&rating=g`;
    const r = await fetch(url, { signal });
    const data: { data?: GiphyGif[] } = await r.json();
    return (data.data ?? []).map((g) => ({
      id: `giphy-${g.id}`,
      provider: "giphy" as Provider,
      thumb: g.images.fixed_height_small?.url || g.images.fixed_height?.url || g.images.original.url,
      full: g.images.original.url,
      alt: g.title,
      photographerName: g.username || undefined,
      sourceUrl: g.url,
    }));
  }
  return [];
}

// Round-robin interleave so results from each provider are mixed evenly.
function interleave<T>(lists: T[][]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (list[i] !== undefined) result.push(list[i]);
    }
  }
  return result;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return cur;
    cur = cur.parentElement;
  }
  return window;
}

async function trackUnsplashDownload(downloadLocation: string) {
  if (!UNSPLASH_KEY) return;
  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } });
  } catch (err) {
    console.warn("Unsplash download tracking failed", err);
  }
}

export default function PicturesPanel({ onAdd }: Props) {
  const availableProviders = useMemo<Provider[]>(
    () => (["pexels", "unsplash", "pixabay", "giphy"] as Provider[]).filter((p) => !!PROVIDER_KEYS[p]),
    [],
  );

  const [query, setQuery] = useState("");
  const [aiImages, setAiImages] = useState<GeneratedImage[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Close the photo-info popover when clicking elsewhere
  useEffect(() => {
    if (!infoOpenId) return;
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setInfoOpenId(null);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [infoOpenId]);

  useEffect(() => { setInfoOpenId(null); }, [query]);

  // Surface the user's own AI-generated images (searched by the same query), so
  // they're reusable straight from Photos without switching to the AI tab.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      listGeneratedImages({ search: query.trim(), limit: 12 })
        .then((rows) => { if (!cancelled) setAiImages(rows); })
        .catch(() => { if (!cancelled) setAiImages([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  // Reset + load first page whenever the query changes
  useEffect(() => {
    if (availableProviders.length === 0) return;
    setLoading(true);
    setError(null);
    setPhotos([]);
    setPage(1);
    setHasMore(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const results = await Promise.all(
          availableProviders.map((p) => search(p, query.trim(), 1, controller.signal).catch(() => [] as Photo[])),
        );
        const merged = dedupeById(interleave(results));
        setPhotos(merged);
        // If nothing comes back (or close to it), stop fetching more
        if (merged.length < PER_PROVIDER) setHasMore(false);
      } catch (err) {
        const e = err as { name?: string };
        if (e.name !== "AbortError") setError("Failed to load photos");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query, availableProviders]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || availableProviders.length === 0) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const controller = new AbortController();
      const results = await Promise.all(
        availableProviders.map((p) => search(p, query.trim(), nextPage, controller.signal).catch(() => [] as Photo[])),
      );
      const merged = interleave(results);
      if (merged.length === 0) {
        setHasMore(false);
      } else {
        setPhotos((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const fresh = merged.filter((x) => !seen.has(x.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        setPage(nextPage);
        if (merged.length < PER_PROVIDER) setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [hasMore, page, availableProviders, query]);

  // Infinite scroll — observe a sentinel inside whichever ancestor actually scrolls.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = findScrollParent(sentinel);
    const rootEl = root instanceof Window ? null : root;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: rootEl, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  if (availableProviders.length === 0) {
    return (
      <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
        <p className="font-semibold text-amber-800 mb-2">Set up a stock photo provider</p>
        <p className="mb-2">Add any of these keys to your <code className="font-mono text-[10px] bg-white px-1 py-0.5 rounded">.env.local</code>:</p>
        <ul className="space-y-1.5">
          {(Object.keys(PROVIDER_DOCS) as Provider[]).map((p) => (
            <li key={p}>
              <span className="font-semibold">{PROVIDER_LABELS[p]}:</span>{" "}
              <code className="font-mono text-[10px] bg-white px-1 py-0.5 rounded">{PROVIDER_DOCS[p].envVar}</code>
              <span className="text-gray-500"> — {PROVIDER_DOCS[p].site}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const handleAdd = async (photo: Photo) => {
    setAdding(photo.id);
    try {
      if (photo.provider === "unsplash" && photo.downloadLocation) {
        trackUnsplashDownload(photo.downloadLocation);
      }
      const dataUrl = await fetchAsDataUrl(photo.full);
      onAdd(dataUrl);
    } catch (err) {
      console.error("Failed to add photo", err);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search photos..."
          className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {/* Your AI-generated images (reusable straight from Photos). */}
      {aiImages.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-violet-500" /> Your AI images
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {aiImages.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onAdd(g.data_url)}
                title={g.description ?? g.title ?? g.prompt}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("application/x-jooma-image", g.data_url)}
                className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 hover:border-violet-400 block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(g.data_url, 240)}
                  onError={(e) => { const t = e.currentTarget; if (t.src !== g.data_url) t.src = g.data_url; }}
                  alt={g.title ?? g.prompt}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  draggable={false}
                />
              </button>
            ))}
          </div>
          <div className="mt-3 mb-1 border-t" style={{ borderColor: "#EDEAE0" }} />
          <p className="text-[10px] font-medium text-gray-400 mb-1">Stock photos</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {photos.map((p) => (
          <div key={p.id} className="relative group">
            <button
              onClick={() => handleAdd(p)}
              disabled={adding === p.id}
              title={p.alt}
              className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 hover:border-violet-400 relative disabled:opacity-60 block"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-jooma-image", p.full);
                if (p.provider === "unsplash" && p.downloadLocation) {
                  trackUnsplashDownload(p.downloadLocation);
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumb}
                alt={p.alt}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
              {adding === p.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </button>
            {p.photographerName && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoOpenId((cur) => (cur === p.id ? null : p.id));
                }}
                title="Photo info"
                className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center transition-opacity ${
                  infoOpenId === p.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
            {infoOpenId === p.id && p.photographerName && (
              <div
                ref={infoRef}
                className="absolute top-9 right-1.5 z-50 bg-white border rounded-lg shadow-lg p-2 text-[11px] w-44"
                style={{ borderColor: "#DAD8D0" }}
              >
                <p className="text-gray-500 leading-tight">Photo by</p>
                {p.photographerUrl ? (
                  <a
                    href={p.photographerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-gray-800 hover:underline truncate block"
                  >
                    {p.photographerName}
                  </a>
                ) : (
                  <p className="font-semibold text-gray-800 truncate">{p.photographerName}</p>
                )}
                {p.sourceUrl && (
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 flex items-center gap-1 text-violet-700 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on {PROVIDER_LABELS[p.provider]}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && photos.length === 0 && !error && (
          <p className="col-span-2 text-xs text-gray-400 text-center py-6">No photos found</p>
        )}
      </div>

      {/* Infinite-scroll sentinel + spinner */}
      <div ref={sentinelRef} className="flex items-center justify-center py-4">
        {loadingMore && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        {!hasMore && photos.length > 0 && (
          <span className="text-[10px] text-gray-400">No more results</span>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-1">
        Photos from {availableProviders.map((p) => PROVIDER_LABELS[p]).join(", ")}
      </p>
    </div>
  );
}
