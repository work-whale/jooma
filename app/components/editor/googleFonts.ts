// Curated list of popular Google Fonts. Loaded lazily via a single <link> tag
// (see useGoogleFonts hook) so we don't pay the cost unless the Text panel opens.
//
// Each entry stores the CSS `font-family` value used everywhere else in the editor
// (TextElement, ContextualToolbar, PPTX export, etc.). The name is just the display label.

export interface GoogleFont {
  name: string;
  family: string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-serif (workhorses)
  { name: "Inter", family: "'Inter', sans-serif", category: "sans-serif" },
  { name: "Roboto", family: "'Roboto', sans-serif", category: "sans-serif" },
  { name: "Open Sans", family: "'Open Sans', sans-serif", category: "sans-serif" },
  { name: "Lato", family: "'Lato', sans-serif", category: "sans-serif" },
  { name: "Montserrat", family: "'Montserrat', sans-serif", category: "sans-serif" },
  { name: "Poppins", family: "'Poppins', sans-serif", category: "sans-serif" },
  { name: "Raleway", family: "'Raleway', sans-serif", category: "sans-serif" },
  { name: "Nunito", family: "'Nunito', sans-serif", category: "sans-serif" },
  { name: "Work Sans", family: "'Work Sans', sans-serif", category: "sans-serif" },
  { name: "DM Sans", family: "'DM Sans', sans-serif", category: "sans-serif" },
  { name: "Manrope", family: "'Manrope', sans-serif", category: "sans-serif" },
  { name: "Rubik", family: "'Rubik', sans-serif", category: "sans-serif" },
  { name: "Karla", family: "'Karla', sans-serif", category: "sans-serif" },
  { name: "Fira Sans", family: "'Fira Sans', sans-serif", category: "sans-serif" },
  { name: "Mulish", family: "'Mulish', sans-serif", category: "sans-serif" },
  // Display (impactful)
  { name: "Oswald", family: "'Oswald', sans-serif", category: "display" },
  { name: "Bebas Neue", family: "'Bebas Neue', sans-serif", category: "display" },
  { name: "Anton", family: "'Anton', sans-serif", category: "display" },
  { name: "Archivo Black", family: "'Archivo Black', sans-serif", category: "display" },
  { name: "Russo One", family: "'Russo One', sans-serif", category: "display" },
  { name: "Bricolage Grotesque", family: "'Bricolage Grotesque', sans-serif", category: "display" },
  // Serif (editorial)
  { name: "Playfair Display", family: "'Playfair Display', serif", category: "serif" },
  { name: "Merriweather", family: "'Merriweather', serif", category: "serif" },
  { name: "Libre Baskerville", family: "'Libre Baskerville', serif", category: "serif" },
  { name: "Cormorant Garamond", family: "'Cormorant Garamond', serif", category: "serif" },
  { name: "Crimson Text", family: "'Crimson Text', serif", category: "serif" },
  { name: "Lora", family: "'Lora', serif", category: "serif" },
  { name: "PT Serif", family: "'PT Serif', serif", category: "serif" },
  { name: "EB Garamond", family: "'EB Garamond', serif", category: "serif" },
  // Handwriting (informal)
  { name: "Dancing Script", family: "'Dancing Script', cursive", category: "handwriting" },
  { name: "Pacifico", family: "'Pacifico', cursive", category: "handwriting" },
  { name: "Caveat", family: "'Caveat', cursive", category: "handwriting" },
  { name: "Permanent Marker", family: "'Permanent Marker', cursive", category: "handwriting" },
  { name: "Architects Daughter", family: "'Architects Daughter', cursive", category: "handwriting" },
  { name: "Shadows Into Light", family: "'Shadows Into Light', cursive", category: "handwriting" },
  { name: "Indie Flower", family: "'Indie Flower', cursive", category: "handwriting" },
  // Monospace (code/labels)
  { name: "JetBrains Mono", family: "'JetBrains Mono', monospace", category: "monospace" },
  { name: "Fira Code", family: "'Fira Code', monospace", category: "monospace" },
  { name: "Source Code Pro", family: "'Source Code Pro', monospace", category: "monospace" },
  { name: "IBM Plex Mono", family: "'IBM Plex Mono', monospace", category: "monospace" },
];

let injected = false;

/**
 * Adds a single Google Fonts <link> tag to <head> covering every entry in
 * GOOGLE_FONTS. Idempotent — safe to call from multiple components / on every mount.
 * Browsers will lazy-load each @font-face file on demand (font-display: swap).
 */
export function injectGoogleFonts() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const families = GOOGLE_FONTS.map((f) => `family=${f.name.replace(/ /g, "+")}:wght@400;700`).join("&");
  const url = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.jooma = "google-fonts";
  document.head.appendChild(link);
}
