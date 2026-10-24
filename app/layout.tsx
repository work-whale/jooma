import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Lora,
  Playfair_Display,
  Inter,
  Archivo_Black,
  Plus_Jakarta_Sans,
} from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Analytics } from "@vercel/analytics/next";
import MetaPixel from "@/app/components/MetaPixel";
import { SITE_DESCRIPTION } from "@/app/lib/seo/brand";
import { isIndexable } from "@/app/lib/seo/indexable";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["200","300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

// The Jooma V2 brand face, used by the marketing landing page. Three weights
// only — 400, 600, 800 — per the brand bible; there is no 500 or 700 and no
// italic outside a pull quote. `next/font` self-hosts it at build time, which
// is what the handover asks for (speed, and no Google Fonts CDN request from a
// visitor's browser).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

// Slideshow theme fonts — referenced by name in the slide renderers
// (`makeText` picks `theme.fonts.heading` / `theme.fonts.body` as the CSS
// font-family). Without these `next/font` imports the browser silently
// falls back to the same system serif/sans for every theme and theme
// switching has no visible font effect.
//
// preload: false on these, Inter and Geist Mono. They stay available (the
// @font-face rules still ship and the browser fetches a file the moment a
// slide or app screen uses it), but they no longer compete with the two faces
// every marketing page renders first, Plus Jakarta and Bricolage, which keep
// their preload. Before this the homepage preloaded nine font files.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  preload: false,
});
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  preload: false,
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  preload: false,
});
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: ["400"],
  preload: false,
});

/* metadataBase is what makes every relative URL below resolve absolutely, which
 * is what a crawler and a social card need. Without it Next emits paths and
 * Google is left to guess the host.
 *
 * The icons here are the same files Next already picks up by convention from
 * app/favicon.ico and app/apple-icon.png. Declaring them changes nothing a
 * browser does; it states the intent, and it is the hook for anything that
 * needs an explicit apple-touch-icon.
 *
 * The site icon Google shows in a search result comes from its own crawl and
 * cache, not from this file, so a stale icon there outlives a deploy. The
 * Organization block on the landing page is the signal that actually names our
 * logo; see app/page.tsx.
 *
 * The title template gives every page "Its title | Jooma" without each page
 * typing the brand. It does not reach app/page.tsx (same segment), which sets
 * its own. A page whose title already names Jooma uses `absolute`.
 *
 * "Jooma" alone is shared with an unrelated business in search results (Search
 * Console shows "jooma shop" and "jooma subscription" queries that are not us),
 * so the default title says which Jooma this is.
 *
 * No openGraph.url here: it was "/", which every page inherited, so /contact
 * and every /made page told social cards they were the homepage. Without it the
 * card uses the page's own address. The social image is app/opengraph-image.tsx,
 * found by convention.
 *
 * robots is noindex everywhere but production; see app/lib/seo/indexable.ts.
 * A page that sets its own robots replaces this rather than merging with it,
 * which is fine: every page that does so is noindexing itself. */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.jooma.ai"),
  title: {
    default: "Jooma: teaching resources for UK teachers",
    template: "%s | Jooma",
  },
  description: SITE_DESCRIPTION,
  ...(isIndexable() ? {} : { robots: { index: false, follow: false } }),
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Jooma",
    locale: "en_GB",
    title: "Jooma: teaching resources for UK teachers",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Jooma: teaching resources for UK teachers",
    description: SITE_DESCRIPTION,
  },
};

/* Without this, mobile browsers render at a ~980px virtual viewport and zoom
 * out — so every sm:/md:/lg: class in the app resolved to its DESKTOP branch on
 * a phone, and the whole product rendered as a shrunken desktop page rather
 * than a mobile one. This is what makes the breakpoints real.
 *
 * No maximumScale/userScalable: pinch-zoom is an accessibility requirement,
 * not a layout bug to suppress.
 *
 * viewportFit "cover" lets the page run under the notch and the home indicator,
 * which is what makes env(safe-area-inset-*) report real values; every
 * edge-adjacent bar pads itself by those insets. interactiveWidget
 * "resizes-content" shrinks the layout viewport when the Android keyboard opens,
 * so a dvh-sized composer stays above it instead of behind it. iOS Safari
 * ignores it and pans the focused field into view instead. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      data-scroll-behavior="smooth"
      className={`${bricolage.variable} ${geistMono.variable} ${lora.variable} ${playfair.variable} ${inter.variable} ${archivoBlack.variable} ${jakarta.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full flex flex-col" style={{ backgroundColor: "var(--j-bg)" }} suppressHydrationWarning>
        <NextTopLoader color="#5B2ED6" showSpinner={false} />
        {children}
        <Analytics />
        {/* Renders nothing unless NEXT_PUBLIC_META_PIXEL_ID is set, so local
            and staging cannot report into the live pixel. */}
        <MetaPixel />
      </body>
    </html>
  );
}
