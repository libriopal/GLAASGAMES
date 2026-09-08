#!/usr/bin/env python3
"""Pins the concept corpus to a hash, so the palette's provenance is checkable.

WHY THIS EXISTS. `web/theme.ts` says every colour traces to 4,613,440 measured
pixels across 1,129 images, and `verify-theme` T1 checks that claim against
`corpus-digest.json`. But the digest is a committed artifact and the images are
not in this repository, so T1 was checking the digest against itself: an
assertion with no witness, in the one place the project claims "derived, not
chosen".

Committing 1,129 JPEGs would bloat the repo and duplicate another repository's
content. So the manifest does what `lattice/ruleset.ts` does for the rules:
publish a hash, and let anyone holding the corpus recompute it. The images stay
where they are; the CLAIM about them becomes falsifiable.

    ./manifest-corpus.py <image-dir> [out.json]     write the manifest
    ./manifest-corpus.py <image-dir> --check <in>   verify a corpus against one
"""
import hashlib
import json
import pathlib
import sys

EXTS = {".jpeg", ".jpg", ".png"}


def digest_dir(directory: pathlib.Path) -> dict:
    files = {}
    for path in sorted(p for p in directory.iterdir() if p.suffix.lower() in EXTS):
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        files[path.name] = h.hexdigest()
    # The root binds the NAMES and the ORDER as well as the bytes, so a renamed
    # or reordered corpus is a different corpus.
    root = hashlib.sha256("\n".join(f"{n}:{d}" for n, d in files.items()).encode()).hexdigest()
    return {"images": len(files), "root": root, "files": files}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    directory = pathlib.Path(sys.argv[1])
    computed = digest_dir(directory)

    if "--check" in sys.argv:
        expected = json.loads(pathlib.Path(sys.argv[sys.argv.index("--check") + 1]).read_text())
        if computed["root"] == expected["root"]:
            print(f"corpus OK: {computed['images']} images, root {computed['root'][:16]}...")
            return 0
        missing = sorted(set(expected["files"]) - set(computed["files"]))
        extra = sorted(set(computed["files"]) - set(expected["files"]))
        changed = sorted(n for n in set(computed["files"]) & set(expected["files"])
                         if computed["files"][n] != expected["files"][n])
        print(f"CORPUS MISMATCH: {len(missing)} missing, {len(extra)} unexpected, {len(changed)} changed")
        for group, names in (("missing", missing), ("unexpected", extra), ("changed", changed)):
            for n in names[:10]:
                print(f"  {group}: {n}")
        return 1

    out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "corpus-manifest.json")
    out.write_text(json.dumps(computed, indent=1))
    print(f"wrote {out}: {computed['images']} images, root {computed['root']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
