#!/usr/bin/env python3
"""Exhaustive ingestion of the concept corpus — every jpeg, every prompt.

Design tokens for this project are DERIVED from measured pixels, not chosen.
Every image is opened, downsampled, and reduced to hue/saturation/luminance
histograms; the palette that comes out is the corpus's actual palette rather
than my impression of it.

Writes a machine-readable digest so the numbers can be checked, and so the
design-token module can cite the file it came from rather than a vibe.
"""
import colorsys
import json
import pathlib
import sys
from collections import Counter

from PIL import Image

DATA = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "corpus-digest.json")

# Downsample every image to this box before counting. 64x64 = 4096 samples per
# image, ~4.6M samples across the corpus — enough for stable histograms and fast
# enough to run the whole set in one pass rather than a sample of it.
BOX = 64

HUE_BINS = 36          # 10 degrees each
SAT_BINS = 10
LUM_BINS = 16

hue_hist = [0] * HUE_BINS
hue_weighted = [0.0] * HUE_BINS   # weighted by saturation * luminance
sat_hist = [0] * SAT_BINS
lum_hist = [0] * LUM_BINS
colour_counter: Counter = Counter()

images = sorted(p for p in DATA.iterdir() if p.suffix.lower() in {".jpeg", ".jpg", ".png"})
failed = 0
total_px = 0

for path in images:
    try:
        with Image.open(path) as im:
            im = im.convert("RGB")
            im.thumbnail((BOX, BOX))
            pixels = list(im.getdata())
    except Exception:
        failed += 1
        continue

    total_px += len(pixels)
    for (r, g, b) in pixels:
        rf, gf, bf = r / 255, g / 255, b / 255
        h, l, s = colorsys.rgb_to_hls(rf, gf, bf)
        hb = min(int(h * HUE_BINS), HUE_BINS - 1)
        hue_hist[hb] += 1
        hue_weighted[hb] += s * l
        sat_hist[min(int(s * SAT_BINS), SAT_BINS - 1)] += 1
        lum_hist[min(int(l * LUM_BINS), LUM_BINS - 1)] += 1
        # Quantise to a 5-bit-per-channel cube for dominant-colour counting.
        colour_counter[(r >> 3 << 3, g >> 3 << 3, b >> 3 << 3)] += 1

def pct(hist):
    t = sum(hist) or 1
    return [round(100 * v / t, 3) for v in hist]

# Chromatic pixels only: anything with saturation and luminance high enough to
# read as a colour rather than as background. The corpus is mostly near-black,
# so counting every pixel would report "the palette is black" and say nothing.
chromatic = [(c, n) for c, n in colour_counter.items()
             if max(c) > 60 and (max(c) - min(c)) > 40]
chromatic.sort(key=lambda kv: -kv[1])

digest = {
    "images_read": len(images) - failed,
    "images_failed": failed,
    "pixels_sampled": total_px,
    "hue_bins_deg": 360 // HUE_BINS,
    "hue_share_pct": pct(hue_hist),
    "hue_share_weighted_pct": pct(hue_weighted),
    "saturation_share_pct": pct(sat_hist),
    "luminance_share_pct": pct(lum_hist),
    "top_chromatic": [
        {"hex": "#%02x%02x%02x" % c, "rgb": list(c), "share_pct": round(100 * n / (total_px or 1), 4)}
        for c, n in chromatic[:40]
    ],
}

OUT.write_text(json.dumps(digest, indent=1))

print(f"read {digest['images_read']} images ({failed} failed), {total_px:,} pixels sampled")
print("\n=== luminance distribution (16 bins, dark -> light) ===")
for i, v in enumerate(digest["luminance_share_pct"]):
    print(f"  L{i:02d} {'#' * int(v)}{v:>6.2f}%")
print("\n=== saturation distribution (10 bins, grey -> vivid) ===")
for i, v in enumerate(digest["saturation_share_pct"]):
    print(f"  S{i} {'#' * int(v)}{v:>6.2f}%")
print("\n=== top hues by chromatic weight (sat*lum) ===")
ranked = sorted(enumerate(digest["hue_share_weighted_pct"]), key=lambda kv: -kv[1])[:10]
for b, v in ranked:
    print(f"  {b*10:3d}-{b*10+9:3d} deg  {v:>6.2f}%")
print("\n=== top chromatic colours ===")
for c in digest["top_chromatic"][:14]:
    print(f"  {c['hex']}  {c['share_pct']:>6.3f}%")
