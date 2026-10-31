#!/usr/bin/env python3
"""Converts the PNG masters in src/assets/art to the WebP files the game ships.

The game prefers .webp when both exist, so phones download the small WebP while the PNG stays
in the repository as the pixel-verified master (npm run validate:assets checks it in full).

Usage: npm run art:webp            (only rewrites WebP files older than their PNG)
       npm run art:webp -- --force
Requires Pillow (pip install Pillow). Alpha is kept at full quality; colour uses quality 95
with sharp YUV conversion, which keeps painted detail while cutting size about 4-5x.
"""
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: pip install Pillow")

ART = Path(__file__).resolve().parent.parent / "src" / "assets" / "art"
FORCE = "--force" in sys.argv


def main() -> int:
    masters = sorted(p for p in ART.rglob("*.png"))
    if not masters:
        print("No PNG masters in src/assets/art")
        return 0
    for png in masters:
        webp = png.with_suffix(".webp")
        if not FORCE and webp.exists() and webp.stat().st_mtime >= png.stat().st_mtime:
            print(f"up to date  {webp.relative_to(ART.parent.parent.parent)}")
            continue
        img = Image.open(png).convert("RGBA")
        img.save(webp, "WEBP", quality=95, alpha_quality=100, method=6, use_sharp_yuv=True, exact=False)
        print(
            f"wrote       {webp.relative_to(ART.parent.parent.parent)}  "
            f"{os.path.getsize(png) // 1024} KB PNG -> {os.path.getsize(webp) // 1024} KB WebP"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
