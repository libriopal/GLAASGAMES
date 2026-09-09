#!/usr/bin/env python3
"""Mines the corpus's LIGHTING from its images, the way the palette mined its colour.

WHAT THIS FOUND, WHICH NOBODY HAD LOOKED FOR.

`design/ingest-corpus.py` measured what colours the corpus uses. This measures
where it puts its LIGHT: every image is downsampled to 8x8, its own mean is
subtracted so brightness cancels out, and the residuals are averaged across the
whole corpus.

If the corpus had no shared composition the answer would be noise near zero.
It is not. Across 1115 images the mean residual is a clean VIGNETTE — corners at
about -17 to -19, an upper-centre lobe at about +17 - with a peak-to-peak swing
of 39 of 255. The corpus is centre-lit and edge-darkened, consistently, and that
is a compositional signature its own prompts never state.

That is what the token ground is painted with. A die in this game is not lit by
a gradient somebody liked; it is lit the way the corpus lights everything.

    python3 scripts/mine-token-texture.py <image-dir> [out.json]

The tile is pinned to `design/token-texture.json` with a digest, exactly as
`design/corpus-manifest.json` pins the images and `design/allele-pool.json`
pins the grammar. `verify-tokens` P7 recomputes it when the corpus is present
and checks the linkage when it is not.
"""
import glob
import hashlib
import json
import os
import statistics
import sys

from PIL import Image

N = 8
DEFAULT_DIR = os.environ.get("GLAAS_CORPUS_DIR", "/home/user/libriopal/magentadice-cyancode/data")


def mine(directory: str) -> dict:
    files = sorted(glob.glob(os.path.join(directory, "*.jpeg")) +
                   glob.glob(os.path.join(directory, "*.jpg")) +
                   glob.glob(os.path.join(directory, "*.png")))
    acc = [0.0] * (N * N)
    read = 0
    failed = 0
    for path in files:
        try:
            im = Image.open(path).convert("L").resize((N, N), Image.BOX)
        except Exception:
            # Counted, never skipped silently. A corpus that quietly shrinks is
            # a measurement nobody can reproduce.
            failed += 1
            continue
        data = list(im.getdata())
        mean = sum(data) / len(data)
        # The image's OWN mean is subtracted, so a bright image and a dark one
        # contribute the same shape. This measures composition, not exposure.
        for i, v in enumerate(data):
            acc[i] += v - mean
        read += 1

    if read == 0:
        raise SystemExit("mine-token-texture: no readable images")

    tile = [round(a / read, 3) for a in acc]
    body = json.dumps(tile, separators=(",", ":"))
    return {
        "generator": "scripts/mine-token-texture.py",
        "images_read": read,
        "images_failed": failed,
        "grid": N,
        # Signed luminance offsets, row-major, in 0-255 units.
        "tile": tile,
        "peak_offset": round(max(abs(v) for v in tile), 3),
        "mean_abs_offset": round(statistics.mean([abs(v) for v in tile]), 3),
        "digest": hashlib.sha256(f"glaas-token-texture-v1\n{read}\n{body}".encode()).hexdigest(),
    }


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "design/token-texture.json")
    result = mine(src)
    with open(out, "w") as fh:
        json.dump(result, fh, indent=1)
        fh.write("\n")
    print(f"mine-token-texture: {result['images_read']} images "
          f"({result['images_failed']} unreadable); peak offset "
          f"{result['peak_offset']}/255; digest {result['digest'][:12]}")
