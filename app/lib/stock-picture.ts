// One stock photo for a search, as the editor stores pictures it adds: a data
// URL with its natural size. Used by Ask Jo to fill the picture on a slide it
// adds. Browser only, with the same public keys and safe search as the
// editor's Pictures panel.

const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_KEY;
const PEXELS_KEY = process.env.NEXT_PUBLIC_PEXELS_API_KEY;

export interface StockPicture {
  src: string;
  width: number;
  height: number;
}

async function candidates(query: string, signal: AbortSignal): Promise<string[]> {
  if (PIXABAY_KEY) {
    try {
      const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=5&image_type=photo&safesearch=true&orientation=horizontal`;
      const data = (await (await fetch(url, { signal })).json()) as { hits?: { largeImageURL?: string }[] };
      const found = (data.hits ?? []).map((h) => h.largeImageURL).filter((u): u is string => !!u);
      if (found.length) return found;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
    }
  }
  if (PEXELS_KEY) {
    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
      const data = (await (await fetch(url, { headers: { Authorization: PEXELS_KEY }, signal })).json()) as { photos?: { src?: { large?: string } }[] };
      return (data.photos ?? []).map((p) => p.src?.large).filter((u): u is string => !!u);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
    }
  }
  return [];
}

async function asDataUrl(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Fetch failed");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(blob);
  });
}

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Decode failed"));
    img.src = src;
  });
}

/** The first photo for `query` that downloads and decodes, or null. */
export async function findStockPicture(query: string, signal: AbortSignal): Promise<StockPicture | null> {
  for (const url of await candidates(query, signal)) {
    try {
      const src = await asDataUrl(url, signal);
      const { width, height } = await measure(src);
      if (width > 0 && height > 0) return { src, width, height };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
    }
  }
  return null;
}
