import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/app/lib/seo/brand";

// Served at /manifest.webmanifest. What a phone uses for "Add to Home Screen",
// and one more consistent statement of the name and description for anything
// that reads it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jooma",
    short_name: "Jooma",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5B2ED6",
    lang: "en-GB",
    icons: [
      { src: "/logo/Jooma-logo-v2-round-light-512.png", sizes: "512x512", type: "image/png" },
      { src: "/logo/Jooma-logo-v2-round-light-1024.png", sizes: "1024x1024", type: "image/png" },
    ],
  };
}
