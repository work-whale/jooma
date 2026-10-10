// A whole deck moved onto another theme, as a pure function over its slides.
//
// Lifted out of the editor's theme picker so Ask Jo can change the theme
// through exactly the same path. Every slide that carries a `skeleton` (an
// AI generated slide) is re-rendered under the new theme, keeping its images
// and audio or video. Edits made to such a slide's text boxes by hand are
// overwritten: that is the trade-off for true "skin" behaviour. Audio, video
// and hand-made slides have no skeleton, so they are recoloured instead.

import { backgroundDecorations, rerenderSlideWithTheme } from "./slideshow-layouts";
import { getTheme, getThemeArt, type ArtStyleId } from "./slideshowThemes";
import type { DeckSlide } from "./deck-events";

export function rethemeDeck<T extends DeckSlide>(slides: T[], nextThemeId: string, artStyle: ArtStyleId): T[] {
  const theme = getTheme(nextThemeId);
  const headingColor = theme.palette.headingColor ?? theme.palette.accent;
  const next = slides.map((s, i) => {
    // Audio activity slide: re-colour bg, panel, and any slide-level texts so
    // it follows the new theme. Heading texts (weight 600 and up) take the
    // theme heading colour and font; body texts take the body colour and font.
    if ((s.audios?.length ?? 0) > 0) {
      return {
        ...s,
        background: theme.palette.background,
        shapes: [
          ...backgroundDecorations(theme, !!s.backgroundImage),
          ...(s.shapes ?? []).filter((sh) => !sh.id.startsWith("dec_")),
        ],
        texts: s.texts.map((t) => {
          const isHeading = parseInt(t.fontWeight, 10) >= 600;
          return {
            ...t,
            color: isHeading ? headingColor : theme.palette.text,
            fontFamily: isHeading ? theme.fonts.heading : theme.fonts.body,
          };
        }),
        audios: (s.audios ?? []).map((a) => ({
          ...a,
          panelBg: theme.palette.accent,
          panelInk: theme.palette.overlayText,
          playBg: theme.palette.background,
          playInk: theme.palette.text,
          headingFont: theme.fonts.heading,
        })),
        themeId: i === 0 ? nextThemeId : s.themeId,
      };
    }
    // YouTube video slide: re-colour bg and slide-level texts. The first text
    // (heading) uses the accent; the rest (subtitle) use muted.
    if ((s.videos?.length ?? 0) > 0) {
      return {
        ...s,
        background: theme.palette.background,
        shapes: [
          ...backgroundDecorations(theme, !!s.backgroundImage),
          ...(s.shapes ?? []).filter((sh) => !sh.id.startsWith("dec_")),
        ],
        texts: s.texts.map((t, ti) => ({
          ...t,
          color: ti === 0 ? theme.palette.accent : theme.palette.muted,
          fontFamily: ti === 0 ? theme.fonts.heading : t.fontFamily,
        })),
        themeId: i === 0 ? nextThemeId : s.themeId,
      };
    }
    if (!s.skeleton) {
      // No skeleton (audio-answer slide, manual slide, or a deck from before
      // skeletons): it cannot be rebuilt from its layout, but a theme switch is
      // a skin change, so the background and text are recoloured and the fonts
      // swapped rather than leaving it stranded on the previous theme.
      return {
        ...s,
        background: theme.palette.background,
        shapes: [
          ...backgroundDecorations(theme, !!s.backgroundImage),
          ...(s.shapes ?? []).filter((sh) => !sh.id.startsWith("dec_")),
        ],
        texts: s.texts.map((t) => {
          const isHeading = parseInt(t.fontWeight, 10) >= 600;
          return {
            ...t,
            fontFamily: isHeading ? theme.fonts.heading : theme.fonts.body,
            color: isHeading ? headingColor : theme.palette.text,
          };
        }),
        themeId: i === 0 ? nextThemeId : s.themeId,
      };
    }
    // AI content slide: re-render from its skeleton, keeping its id.
    const rebuilt = rerenderSlideWithTheme(s, theme, artStyle);
    return { ...rebuilt, id: s.id, themeId: i === 0 ? nextThemeId : rebuilt.themeId } as T;
  }) as T[];

  if (next[0]) next[0] = { ...next[0], themeId: nextThemeId };
  // The theme's full-bleed illustration, for the current art style, on every
  // slide. Set unconditionally, so switching AWAY from an art theme removes it.
  const art = getThemeArt(theme, artStyle);
  for (let i = 0; i < next.length; i++) {
    next[i] = { ...next[i], backgroundArt: art?.src, backgroundArtScrim: art?.scrim };
  }
  if (next[0]) next[0] = { ...next[0], artStyleId: artStyle };
  return next;
}
