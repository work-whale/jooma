#!/usr/bin/env python3
"""Generate PNG exports of the Jooma wordmark.

Run:  python scripts/make-wordmark.py

Writes, at three heights each:

    public/logo/Jooma-logo-v2-{h}.png         purple on transparent
    public/logo/Jooma-logo-v2-white-{h}.png   white on transparent, for deep purple

and the same wordmark as a round badge, to sit alongside the J icon:

    public/logo/Jooma-logo-v2-round-{n}.png        white on a purple disc
    public/logo/Jooma-logo-v2-round-light-{n}.png  purple on a white disc

The source is app/components/v2/Wordmark.tsx, the all-purple lockup in the
nav. It inherits `currentColor`, so it is rendered here in each colour.
make-favicon.py reads the same file for the j in the app icon.

Notes for anyone editing this:

  1. The component's paths live inside `translate(65,745) scale(1,-1)`, so the
     glyphs are stored upside down and are flipped on render. Each path after
     the first carries its own `translate(x,0)` for letter placement. Both
     transforms are applied here; the numbers are read out of the TSX rather
     than duplicated, so moving a letter in the component moves it here too.

  2. Letters are filled NONZERO, the SVG default, via fill_nonzero below.
     Pillow's polygon fill is not good enough here: the m and a each have an
     outline that doubles back on itself, and a plain scanline fill left a
     triangular notch in both shoulders of the m and in the bowl of the a.

  3. Same supersample-and-downsample approach as make-favicon.py, since Pillow
     has no antialiased polygon fill.

Dependencies: Pillow only, as with make-favicon.py.
"""

import io
import os
import re

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "components", "v2", "Wordmark.tsx")
OUT = os.path.join(ROOT, "public", "logo")

PURPLE = (91, 46, 214)   # --j-purple #5B2ED6
WHITE = (255, 255, 255)

VB_W, VB_H = 3036, 967   # the component's viewBox
BASE = (65, 745)         # the outer translate, before the y-flip
SS = 6                   # supersample factor
PAD = 0.04               # breathing room, as a fraction of the wordmark height

# Export heights. Widths follow the mark's own aspect ratio.
HEIGHTS = [128, 256, 512]

# Square sizes for the round badge, matching the J icon's exports.
ROUND_SIZES = [512, 1024, 2048]

# How much of the fitting chord the wordmark uses inside the disc. Below about
# 0.8 the letters start to look lost in the circle; above ~0.92 the j and the
# a crowd the edge.
CHORD_INSET = 0.86

TOKEN = re.compile(r"([MmLlHhVvCcQqSsTtZz])|(-?\d*\.?\d+(?:e-?\d+)?)")


def read_paths(tsx_path):
    """Pull (d, dx) for each <path> in the component, in document order.

    dx is the path's own `translate(x,0)`, or 0 when it has none. The regex
    looks at each path element as a whole so a transform is matched to the d
    it belongs to rather than to whichever came last in the file.
    """
    with io.open(tsx_path, encoding="utf-8") as fh:
        tsx = fh.read()

    out = []
    for el in re.findall(r"<path\b(.*?)/>", tsx, re.S):
        d = re.search(r'd="([^"]+)"', el)
        if not d:
            continue
        tr = re.search(r'transform="translate\(([-\d.]+)\s*,\s*([-\d.]+)\)"', el)
        out.append((d.group(1), float(tr.group(1)) if tr else 0.0))

    if len(out) != 5:
        raise SystemExit(
            "expected 5 glyph paths in %s, found %d. If the wordmark changed, "
            "check the letter-placement assumptions above still hold."
            % (tsx_path, len(out))
        )
    return out


def flatten(d, steps=16):
    """Turn one path's `d` into polygons. Handles M/L/H/V/C/Q/Z, abs and rel.

    Q is what the wordmark actually uses; C is here because it costs nothing
    and the mark may be re-exported from a tool that emits cubics.
    """
    toks = []
    for m in TOKEN.finditer(d):
        toks.append(m.group(1) if m.group(1) else float(m.group(2)))

    def curve(pts):
        """de Casteljau for a quadratic or cubic, given all control points."""
        out = []
        for k in range(1, steps + 1):
            t = k / steps
            p = list(pts)
            while len(p) > 1:
                p = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                     for a, b in zip(p, p[1:])]
            out.append(p[0])
        return out

    polys, pts = [], []
    cur = start = (0.0, 0.0)
    cmd = None
    i = 0
    while i < len(toks):
        if isinstance(toks[i], str):
            cmd = toks[i]
            i += 1
        rel = cmd.islower()

        def pt(ax, ay):
            return (cur[0] + ax, cur[1] + ay) if rel else (ax, ay)

        if cmd in ("M", "m"):
            cur = pt(toks[i], toks[i + 1])
            i += 2
            if pts:
                polys.append(pts)
            pts = [cur]
            start = cur
            cmd = "l" if rel else "L"  # implicit lineto after moveto
        elif cmd in ("L", "l"):
            cur = pt(toks[i], toks[i + 1])
            i += 2
            pts.append(cur)
        elif cmd in ("H", "h"):
            cur = (cur[0] + toks[i], cur[1]) if rel else (toks[i], cur[1])
            i += 1
            pts.append(cur)
        elif cmd in ("V", "v"):
            cur = (cur[0], cur[1] + toks[i]) if rel else (cur[0], toks[i])
            i += 1
            pts.append(cur)
        elif cmd in ("Q", "q"):
            c1 = pt(toks[i], toks[i + 1])
            end = pt(toks[i + 2], toks[i + 3])
            i += 4
            pts.extend(curve([cur, c1, end]))
            cur = end
        elif cmd in ("C", "c"):
            c1 = pt(toks[i], toks[i + 1])
            c2 = pt(toks[i + 2], toks[i + 3])
            end = pt(toks[i + 4], toks[i + 5])
            i += 6
            pts.extend(curve([cur, c1, c2, end]))
            cur = end
        elif cmd in ("Z", "z"):
            if pts:
                pts.append(start)
                polys.append(pts)
                pts = []
            cur = start
        else:
            i += 1  # command we don't use; skip its number
    if pts:
        polys.append(pts)
    return polys


def glyph_polygons(paths):
    """The wordmark as a list of glyphs, each a list of its subpaths.

    Coordinates are in viewBox space and already flipped upright. The grouping
    is kept because it makes the structure obvious when debugging a single
    letter; the nonzero fill itself does not care which glyph a subpath is in.
    """
    glyphs = []
    for d, dx in paths:
        # The letter's own offset, then the group's translate and the
        # scale(1,-1) that the component wraps everything in.
        subs = [[(BASE[0] + dx + x, BASE[1] - y) for x, y in poly]
                for poly in flatten(d) if len(poly) > 2]
        if subs:
            glyphs.append(subs)
    return glyphs


def fill_nonzero(size, polys):
    """Rasterise polygons with the NONZERO winding rule, as an "L" mask.

    Pillow's own polygon fill leaves a hole wherever an outline crosses itself.
    The m and a do exactly that: each has a short segment that doubles back
    into the stem, and the crossing left a triangular notch in both shoulders.
    Nonzero winding is what SVG uses by default and what fills those correctly.

    Scanline through pixel centres, accumulating a winding count per edge
    crossing: +1 for an edge going down, -1 for one going up. Anywhere the
    running total is non-zero is inside.
    """
    w, h = size
    edges = []
    for poly in polys:
        for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
            if ay != by:
                edges.append((ax, ay, bx, by, 1 if by > ay else -1))

    rows = bytearray(w * h)
    for py in range(h):
        y = py + 0.5
        xs = []
        for ax, ay, bx, by, wind in edges:
            if (ay <= y < by) or (by <= y < ay):
                xs.append((ax + (y - ay) * (bx - ax) / (by - ay), wind))
        if not xs:
            continue
        xs.sort()
        count = 0
        for (x_start, wind), (x_end, _) in zip(xs, xs[1:]):
            count += wind
            if count == 0:
                continue
            lo = max(0, int(round(x_start)))
            hi = min(w, int(round(x_end)))
            if hi > lo:
                base = py * w
                rows[base + lo:base + hi] = b"\xff" * (hi - lo)
    return Image.frombytes("L", size, bytes(rows))


def bounds(glyphs):
    pts = [pt for g in glyphs for sub in g for pt in sub]
    xs = [x for x, _ in pts]
    ys = [y for _, y in pts]
    return min(xs), min(ys), max(xs), max(ys)


def render(height, glyphs, rgb):
    """The wordmark at a given height, tight-cropped, on transparency."""
    x0, y0, x1, y1 = bounds(glyphs)
    pad = (y1 - y0) * PAD
    w = int(round(height * (x1 - x0 + 2 * pad) / (y1 - y0 + 2 * pad)))

    sw, sh = w * SS, height * SS
    scale = (sh - 2 * pad * SS * height / (y1 - y0 + 2 * pad)) / (y1 - y0)
    off = (sw - (x1 - x0) * scale) / 2, (sh - (y1 - y0) * scale) / 2

    # One nonzero fill over every subpath of every glyph. Counters come out as
    # holes because they are wound against their outer, which is the same
    # reason the browser renders the component correctly.
    mask = fill_nonzero((sw, sh), [
        [(off[0] + (x - x0) * scale, off[1] + (y - y0) * scale) for x, y in poly]
        for subs in glyphs for poly in subs
    ])

    img = Image.new("RGBA", (sw, sh), rgb + (0,))
    img.putalpha(mask)
    return img.resize((w, height), Image.LANCZOS)


def render_round(size, glyphs, on_purple=True):
    """The wordmark centred in a disc, matching the J icon's badge.

    Sized to a CHORD, not the diameter. The wordmark is about 3:1, so scaling
    it to the full width would run the j and the a straight off the curve. The
    chord across the circle at the wordmark's own half-height is the widest
    line that actually fits, and CHORD_INSET then holds it clear of the edge.
    """
    x0, y0, x1, y1 = bounds(glyphs)
    mw, mh = x1 - x0, y1 - y0

    s = size * (SS if size <= 512 else max(2, 2048 // size))
    r = s / 2.0

    # Half-height of the wordmark as a fraction of the radius, solved so the
    # box corners land on the circle: (w/2)^2 + (h/2)^2 = r^2, with w = h * ar.
    ar = mw / mh
    half_h = r / ((ar * ar + 1) ** 0.5)
    scale = (2 * half_h * CHORD_INSET) / mh

    off = (s - mw * scale) / 2, (s - mh * scale) / 2
    mask = fill_nonzero((s, s), [
        [(off[0] + (x - x0) * scale, off[1] + (y - y0) * scale) for x, y in poly]
        for subs in glyphs for poly in subs
    ])

    disc = Image.new("L", (s, s), 0)
    ImageDraw.Draw(disc).ellipse([0, 0, s - 1, s - 1], fill=255)

    if on_purple:
        img = Image.new("RGBA", (s, s), PURPLE + (255,))
        img.paste(Image.new("RGBA", (s, s), WHITE + (255,)), (0, 0), mask)
    else:
        # Purple letters on white, for placing on a dark or photographic field.
        img = Image.new("RGBA", (s, s), WHITE + (255,))
        img.paste(Image.new("RGBA", (s, s), PURPLE + (255,)), (0, 0), mask)

    img.putalpha(disc)
    return img.resize((size, size), Image.LANCZOS)


def main():
    polys = glyph_polygons(read_paths(SRC))

    # The purple mark is the default, so it carries no colour in its name.
    for name, rgb in (("", PURPLE), ("white-", WHITE)):
        for h in HEIGHTS:
            img = render(h, polys, rgb)
            path = os.path.join(OUT, "Jooma-logo-v2-%s%d.png" % (name, h))
            img.save(path, format="PNG")
            print("wrote %s (%dx%d)" % (path, img.size[0], img.size[1]))

    # Round badge: the wordmark on the same purple disc as the J icon, plus an
    # inverted disc for dark backgrounds.
    for name, on_purple in (("round", True), ("round-light", False)):
        for n in ROUND_SIZES:
            img = render_round(n, polys, on_purple=on_purple)
            path = os.path.join(OUT, "Jooma-logo-v2-%s-%d.png" % (name, n))
            img.save(path, format="PNG")
            print("wrote %s (%dx%d)" % (path, img.size[0], img.size[1]))


if __name__ == "__main__":
    main()
