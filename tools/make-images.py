#!/usr/bin/env python3
"""Builds every optimized image in src/img from the real FUTCHY source renders.

Sources are READ ONLY and live outside this repo (see assets-src/SOURCES.md).
Nothing is generated, painted or re-interpreted: the script only crops, resizes
and re-encodes the original game renders and the original logo / app icon.

    python3 tools/make-images.py

Crop boxes are in 1920x1080 coordinates (the preview size) and are scaled to the
5120x2880 masters.
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw, ImageFont

import os


def _need(var):
    v = os.environ.get(var)
    if not v:
        raise SystemExit(f"set {var} (see assets-src/SOURCES.md)")
    return Path(v).expanduser()


KEYART = _need("FUTCHY_KEYART_FILE")  # the owner-approved 5120x2880 loading-art master
OUT = Path(__file__).resolve().parent.parent / "src/img"
OUT.mkdir(parents=True, exist_ok=True)

SRC = {"KA": KEYART}
LOGO = _need("FUTCHY_LOGO")
ICON = _need("FUTCHY_ICON")

_cache = {}
MANIFEST = {}


def master(key):
    if key not in _cache:
        _cache[key] = Image.open(SRC[key]).convert("RGB")
    return _cache[key]


def save_set(img, name, widths, avif_q=52, webp_q=78):
    """Writes name-<w>.avif / .webp for each width (never upscales)."""
    sizes = []
    for w in widths:
        w = min(w, img.width)
        h = round(img.height * w / img.width)
        r = img.resize((w, h), Image.LANCZOS)
        r.save(OUT / f"{name}-{w}.avif", quality=avif_q, speed=6)
        r.save(OUT / f"{name}-{w}.webp", quality=webp_q, method=6)
        sizes.append((w, h))
    MANIFEST[name] = {"widths": [w for w, _ in sizes], "ratio": [sizes[0][0], sizes[0][1]]}
    print(f"{name}: {sizes}")
    return sizes


def crop_set(key, box, name, widths, **kw):
    k = 5120 / 1920
    x0, y0, x1, y1 = (round(v * k) for v in box)
    save_set(master(key).crop((x0, y0, x1, y1)), name, widths, **kw)


# --- hero: the approved key art (a shark over the net, a scorpion in the circle) --
crop_set("KA", (0, 0, 1920, 1080), "hero", [2400, 1600, 900])
crop_set("KA", (1000, 0, 1740, 1080), "hero-m", [1000, 640])

# --- the world of FUTCHY -------------------------------------------------------
crop_set("KA", (960, 420, 1620, 1080), "world-circles", [1100, 640])
crop_set("KA", (300, 380, 1000, 774), "world-footvolley", [1600, 900])
crop_set("KA", (0, 0, 1920, 1080), "world-court", [1600, 900])
crop_set("KA", (1000, 0, 1920, 690), "world-beach", [1200, 700])

# --- play your way -------------------------------------------------------------
crop_set("KA", (700, 380, 1660, 1080), "play-gameplay", [1100, 640])
crop_set("KA", (1100, 590, 1604, 935), "play-tricks", [900, 520])

# --- trailer poster: a real game frame (swap for a trailer frame when it lands) -
crop_set("KA", (0, 0, 1920, 1080), "trailer-poster", [1600, 900])

# --- logo (original art, transparent) ------------------------------------------
logo = Image.open(LOGO).convert("RGBA")
bbox = logo.getbbox()
logo = logo.crop(bbox)
for w in (900, 480):
    h = round(logo.height * w / logo.width)
    r = logo.resize((w, h), Image.LANCZOS)
    r.save(OUT / f"logo-{w}.webp", quality=88, method=6)
    r.save(OUT / f"logo-{w}.png", optimize=True)
    print("logo", w, h)

# --- app icon / favicon ----------------------------------------------------------
icon = Image.open(ICON).convert("RGBA")
bg = icon.convert("RGB").resize((256, 256)).filter(ImageFilter.GaussianBlur(24)).resize(icon.size)
square = bg.copy()
square.paste(icon, (0, 0), icon)  # fills the rounded corners with its own colours
for size, name in ((180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
    square.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
icon.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png", optimize=True)
icon.resize((48, 48), Image.LANCZOS).save(
    OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
)

# --- Open Graph card 1200x630: real key art + the real logo ---------------------
og = master("KA").crop((0, round(5120 / 1920 * 60), 5120, round(5120 / 1920 * 60) + 2688))
og = og.resize((1200, 630), Image.LANCZOS)
shade = Image.new("RGBA", og.size, (0, 0, 0, 0))
d = ImageDraw.Draw(shade)
for x in range(og.width):
    a = max(0, int(190 * (1 - x / (og.width * 0.62))))
    d.line([(x, 0), (x, og.height)], fill=(4, 14, 24, a))
og = Image.alpha_composite(og.convert("RGBA"), shade)
lw = 470
lh = round(logo.height * lw / logo.width)
og.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), (64, 150))
og.convert("RGB").save(OUT / "og-card.jpg", quality=84, optimize=True, progressive=True)
print("og-card.jpg")

import json
(OUT / "manifest.json").write_text(json.dumps(MANIFEST, indent=1))
print("manifest.json")
