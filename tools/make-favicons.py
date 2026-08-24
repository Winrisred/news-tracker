#!/usr/bin/env python3
"""Generate the News Tracker favicons: the headline block — a red eyebrow
rule above three cream lines, on the site's navy — in every size the pages
and the PWA manifest ask for.

Drawn at 8x and downsampled, which keeps the 1px lines of a 16/32px favicon
smooth instead of jagged.
"""
import os
from PIL import Image, ImageDraw

NAVY = (12, 27, 42, 255)      # --navy   #0C1B2A
NAVY_MID = (26, 51, 82)       # --navy-mid #1A3352
CREAM = (248, 246, 242, 255)  # --cream  #F8F6F2
RED = (230, 57, 70, 255)      # --red    #E63946

OUT = os.path.expanduser(
    "~/Documents/my-projects/live-websites/news-tracker/images")
SS = 8  # supersample factor


def draw(size, rounded=True, opaque=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), NAVY if opaque else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(S * 0.14) if rounded else 0

    if not opaque:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=NAVY)

    # A whisper of the header's depth — never enough to muddy small sizes
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(S):
        gd.line([(0, i), (S, i - S)], fill=NAVY_MID + (int(24 * (1 - i / S)),), width=2)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
    img = Image.composite(Image.alpha_composite(img, glow), img, mask)

    d = ImageDraw.Draw(img)
    # Proportions tuned so the block sits optically centred at every size
    x = S * 0.22
    bars = [(0.250, 0.043, RED),     # the eyebrow rule
            (0.559, 0.066, CREAM),
            (0.469, 0.066, CREAM),
            (0.383, 0.066, CREAM)]
    y = S * 0.30
    for i, (w, h, color) in enumerate(bars):
        bw, bh = S * w, S * h
        d.rounded_rectangle([x, y, x + bw, y + bh], radius=bh / 2, fill=color)
        y += bh + S * (0.051 if i == 0 else 0.059)

    return img.resize((size, size), Image.LANCZOS)


targets = [
    ("favicon-32.png", 32, True, False),
    ("favicon-48.png", 48, True, False),
    ("favicon-96.png", 96, True, False),
    ("favicon-192.png", 192, True, False),
    ("favicon-512.png", 512, True, False),
    # iOS applies its own mask, so this one is square and fully opaque —
    # rounded corners here would show as black notches on the home screen
    ("apple-touch-icon.png", 180, False, True),
]

for name, size, rounded, opaque in targets:
    im = draw(size, rounded=rounded, opaque=opaque)
    if opaque:
        im = im.convert("RGB")
    path = os.path.join(OUT, name)
    im.save(path)
    print("wrote %-24s %dx%d  %d bytes" % (name, size, size, os.path.getsize(path)))
