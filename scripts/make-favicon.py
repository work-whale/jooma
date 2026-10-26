#!/usr/bin/env python3
"""Generate the Jooma favicon and app icons from the brand mark.

Run:  python scripts/make-favicon.py

The mark is the j from the wordmark, solid white on a purple disc. Writes:

    app/favicon.ico       multi-resolution, 16 -> 256
    app/apple-icon.png    180x180, for iOS home screens
    public/logo/icon-v2.svg   the same mark as vector
    public/logo/jooma-v2-{n}.png  512/1024/2048 flat exports of the same mark,
                                  for slide decks, app stores and print

The source is the first glyph in app/components/v2/Wordmark.tsx, read through
make-wordmark.py's own parser, so the icon's j is the wordmark's j and cannot
drift from it. If the wordmark changes, rerun both scripts.

Notes for anyone editing this:

  1. The j is about 3.6 times taller than it is wide, so it is sized by its
     height (J_HEIGHT) rather than fitted to the disc. Its corners stay well
     inside the circle at any value up to about 0.9.

  2. It is centred optically, not by its bounding box. The tail sweeps left of
     the stem, so a box-centred j looks pushed right. OPTICAL_SHIFT moves it
     back by a fraction of the gap between the box centre and the stem centre.

  3. Small sizes get a slightly taller and bolder j (J_HEIGHT_SMALL, BOLDEN).
     At 16px the stem is under two pixels wide otherwise and blurs to a grey
     smear once downsampled.

  4. Same supersample-and-downsample approach as make-wordmark.py, since
     Pillow has no antialiased polygon fill.

Dependencies: Pillow only, as with make-wordmark.py.
"""

import importlib.util
import io
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# make-wordmark.py has a hyphen in its name, so it cannot be imported plainly.
_spec = importlib.util.spec_from_file_location(
    "make_wordmark", os.path.join(ROOT, "scripts", "make-wordmark.py"))
wordmark = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wordmark)

PURPLE = wordmark.PURPLE + (255,)
WHITE = wordmark.WHITE + (255,)

SS = 8   # supersample factor

J_HEIGHT = 0.66        # the j's height, as a fraction of the disc's diameter
J_HEIGHT_SMALL = 0.74  # the same, at or below SIMPLIFY_AT_OR_BELOW
BOLDEN = 0.009         # dilation at small sizes, as a fraction of the canvas.
                       # Much past 0.01 closes the gap under the dot at 32px.
OPTICAL_SHIFT = 0.5    # 0 centres the bounding box, 1 centres the stem

# The j's stem, in the glyph's own units (see the first path in Wordmark.tsx).
STEM_X = (55, 205)

# Sizes that go into the .ico. 16/32 get the taller j.
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
SIMPLIFY_AT_OR_BELOW = 32

# Standalone PNGs of the mark, for anywhere the favicon is too small to use:
# decks, store listings, press, print.
PNG_SIZES = [512, 1024, 2048]


def read_j():
    """The j's path data and its subpaths, upright, in wordmark viewBox space."""
    paths = wordmark.read_paths(wordmark.SRC)
    d, dx = paths[0]
    if dx:
        raise SystemExit("expected the j to be the first, untranslated glyph in %s"
                         % wordmark.SRC)
    return d, wordmark.glyph_polygons([(d, dx)])[0]


def layout(size, subs, small=False):
    """Scale and offset that place the j in a disc `size` across.

    Returns (scale, ox, oy) such that a point (x, y) in viewBox space lands at
    (ox + x * scale, oy + y * scale) on the canvas.
    """
    x0, y0, x1, y1 = wordmark.bounds([subs])
    scale = size * (J_HEIGHT_SMALL if small else J_HEIGHT) / (y1 - y0)

    box_cx = (x0 + x1) / 2
    stem_cx = wordmark.BASE[0] + sum(STEM_X) / 2
    cx = box_cx + (stem_cx - box_cx) * OPTICAL_SHIFT
    cy = (y0 + y1) / 2
    return scale, size / 2 - cx * scale, size / 2 - cy * scale


def render(size, subs, small=False):
    """One square icon: white j on a purple disc, transparent corners."""
    # Supersampling past ~2000px buys nothing visible and costs a lot of
    # memory, so taper the factor on the large PNG exports.
    ss = max(2, min(SS, 2048 // size)) if size > 256 else SS
    s = size * ss

    scale, ox, oy = layout(s, subs, small)
    mask = wordmark.fill_nonzero((s, s), [
        [(ox + x * scale, oy + y * scale) for x, y in poly] for poly in subs
    ])
    if small:
        r = max(1, int(s * BOLDEN))
        mask = mask.filter(ImageFilter.MaxFilter(r * 2 + 1))

    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse([0, 0, s - 1, s - 1], fill=PURPLE)
    img.paste(Image.new("RGBA", (s, s), WHITE), (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


SVG_TEMPLATE = """<svg width="{n}" height="{n}" viewBox="0 0 {n} {n}" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="{r}" cy="{r}" r="{r}" fill="#5B2ED6"/>
<path transform="translate({tx:.2f},{ty:.2f}) scale({k:.5f},{nk:.5f})" d="{d}" fill="#FFFFFF"/>
</svg>
"""


def write_svg(path, d, subs, n=512):
    """The mark as vector, reusing the glyph's own path data untouched.

    The path is stored upside down in the wordmark's glyph space, so the
    wordmark's translate(BASE) scale(1,-1) is folded into this transform.
    """
    scale, ox, oy = layout(n, subs)
    bx, by = wordmark.BASE
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(SVG_TEMPLATE.format(
            n=n, r=n // 2, d=d,
            tx=ox + bx * scale, ty=oy + by * scale, k=scale, nk=-scale))


def main():
    d, subs = read_j()

    frames = [render(n, subs, small=n <= SIMPLIFY_AT_OR_BELOW) for n in ICO_SIZES]
    ico = os.path.join(ROOT, "app", "favicon.ico")
    # Pillow's ICO writer drops any requested size larger than the image it is
    # called on, so save from the LARGEST frame and hand it the rest through
    # append_images. Saving from the smallest silently yields a 1-frame icon.
    frames.sort(key=lambda f: f.size[0])
    frames[-1].save(ico, format="ICO", sizes=[(n, n) for n in ICO_SIZES],
                    append_images=frames[:-1])
    print("wrote %s (%s)" % (ico, ", ".join("%dx%d" % (n, n) for n in ICO_SIZES)))

    apple = os.path.join(ROOT, "app", "apple-icon.png")
    render(180, subs).save(apple, format="PNG")
    print("wrote %s (180x180)" % apple)

    for n in PNG_SIZES:
        png = os.path.join(ROOT, "public", "logo", "jooma-v2-%d.png" % n)
        render(n, subs).save(png, format="PNG")
        print("wrote %s (%dx%d)" % (png, n, n))

    out_svg = os.path.join(ROOT, "public", "logo", "icon-v2.svg")
    write_svg(out_svg, d, subs)
    print("wrote %s" % out_svg)


if __name__ == "__main__":
    main()
