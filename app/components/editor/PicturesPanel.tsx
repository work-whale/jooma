"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";

interface Props {
  onAdd: (dataUrl: string) => void;
}

interface Photo {
  id: string;
  thumb: string;
  full: string;
  alt: string;
  // Attribution (required by Unsplash & Pexels production terms)
  photographerName?: string;
  photographerUrl?: string;
  sourceUrl?: string;          // link back to the photo on the provider
  downloadLocation?: string;   // Unsplash: must be pinged when photo is used
}

type Provider = "pexels" | "unsplash" | "pixabay";

const PEXELS_KEY = process.env.NEXT_PUBLIC_PEXELS_API_KEY;
const UNSPLASH_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_KEY;

const PROVIDER_LABELS: Record<Provider, string> = {
  pexels: "Pexels",
  unsplash: "Unsplash",
  pixabay: "Pixabay",
};

const PROVIDER_KEYS: Record<Provider, string | undefined> = {
  pexels: PEXELS_KEY,
  unsplash: UNSPLASH_KEY,
  pixabay: PIXABAY_KEY,
};

const PROVIDER_URLS: Record<Provider, string> = {
  pexels: "https://www.pexels.com",
  unsplash: "https://unsplash.com",
  pixabay: "https://pixabay.com",
};

const PROVIDER_DOCS: Record<Provider, { envVar: string; site: string }> = {
  pexels: { envVar: "NEXT_PUBLIC_PEXELS_API_KEY", site: "pexels.com/api" },
  unsplash: { envVar: "NEXT_PUBLIC_UNSPLASH_ACCESS_KEY", site: "unsplash.com/developers" },
  pixabay: { envVar: "NEXT_PUBLIC_PIXABAY_KEY", site: "pixabay.com/api/docs/" },
};

// Marketing/referral parameters Unsplash asks integrators to append to their links
// so attribution links carry credit back to the app.
const UTM = "utm_source=jooma&utm_medium=referral";

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
  src: { medium: string; large: string };
  alt: string;
  url: string;
  photographer: string;
  photographer_url: string;
}
interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string };
  alt_description: string | null;
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}
interface PixabayPhoto {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  pageURL: string;
  tags: string;
  user: string;
}

async function search(provider: Provider, query: string, signal: AbortSignal): Promise<Photo[]> {
  const key = PROVIDER_KEYS[provider];
  if (!key) return [];
  if (provider === "pexels") {
    const url = query
      ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30`
      : `https://api.pexels.com/v1/curated?per_page=30`;
    const r = await fetch(url, { headers: { Authorization: key }, signal });
    const data: { photos?: PexelsPhoto[] } = await r.json();
    return (data.photos ?? []).map((p) => ({
      id: String(p.id),
      thumb: p.src.medium,
      full: p.src.large,
      alt: p.alt,
      photographerName: p.photographer,
      photographerUrl: p.photographer_url,
      sourceUrl: p.url,
    }));
  }
  if (provider === "unsplash") {
    const url = query
      ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=30`
      : `https://api.unsplash.com/photos?per_page=30`;
    const r = await fetch(url, { headers: { Authorization: `Client-ID ${key}` }, signal });
    const data: { results?: UnsplashPhoto[] } | UnsplashPhoto[] = await r.json();
    const list = Array.isArray(data) ? data : data.results ?? [];
    return list.map((p) => ({
      id: p.id,
      thumb: p.urls.small,
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
    const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=30&image_type=photo&safesearch=true`;
    const r = await fetch(url, { signal });
    const data: { hits?: PixabayPhoto[] } = await r.json();
    return (data.hits ?? []).map((p) => ({
      id: String(p.id),
      thumb: p.webformatURL,
      full: p.largeImageURL,
      alt: p.tags,
      photographerName: p.user,
      sourceUrl: p.pageURL,
    }));
  }
  return [];
}

// Unsplash requires that we hit the photo's `download_location` whenever a user
// "uses" the photo (i.e. inserts it into their slide). Fire-and-forget; failures
// shouldn't block adding the photo.
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
    () => (["pexels", "unsplash", "pixabay"] as Provider[]).filter((p) => !!PROVIDER_KEYS[p]),
    [],
  );

  const [provider, setProvider] = useState<Provider>(availableProviders[0] ?? "pexels");
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!PROVIDER_KEYS[provider]) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const id = setTimeout(() => {
      search(provider, query.trim(), controller.signal)
        .then(setPhotos)
        .catch((err) => {
          if (err.name !== "AbortError") setError("Failed to load photos");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query, provider]);

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
      // For Unsplash, ping the download_location BEFORE fetching the image — this
      // is required by their API terms and powers their internal usage stats.
      if (provider === "unsplash" && photo.downloadLocation) {
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
      {/* Provider switcher (only when more than one key is configured) */}
      {availableProviders.length > 1 && (
        <div
          className="flex gap-1 overflow-x-auto mb-2 -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {availableProviders.map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                provider === p
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      )}

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

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {photos.map((p) => (
          <div key={p.id} className="space-y-0.5">
            <button
              onClick={() => handleAdd(p)}
              disabled={adding === p.id}
              title={p.alt || p.photographerName}
              className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 hover:border-violet-400 relative disabled:opacity-60 block"
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
              <p className="text-[9px] text-gray-500 truncate" title={p.photographerName}>
                {p.photographerUrl ? (
                  <a
                    href={p.photographerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-gray-700"
                  >
                    {p.photographerName}
                  </a>
                ) : (
                  p.photographerName
                )}
              </p>
            )}
          </div>
        ))}
        {!loading && photos.length === 0 && !error && (
          <p className="col-span-2 text-xs text-gray-400 text-center py-6">No photos found</p>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-3">
        Photos by{" "}
        <a
          href={
            provider === "unsplash"
              ? `${PROVIDER_URLS.unsplash}?${UTM}`
              : PROVIDER_URLS[provider]
          }
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600"
        >
          {PROVIDER_LABELS[provider]}
        </a>
      </p>
    </div>
  );
}
