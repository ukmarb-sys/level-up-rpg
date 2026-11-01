"""
Cuts the Marketplace painting out of the opaque grass field it was delivered on.

    python3 -I scripts/cutout-marketplace.py art-source/raw/buildings/marketplace_original.png \
        art-source/raw/buildings/marketplace.png <preview.png>

Writes a transparent PNG for `npm run art:import` (kept pixels keep their original colours) and a
preview on magenta. Steps: keep the stone-edged plaza diamond; flood-fill grass from the image
border; remove enclosed grass patches (behind the bunting, banners and sign); clear darker and
lantern-lit grass next to the background; smooth ragged edges. All coordinates are pixels of
marketplace_original.png (1536x1024). Needs Pillow; deterministic.
"""
import sys, colorsys
from collections import deque
from PIL import Image, ImageDraw
src, out, preview = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
L, F, R = (50, 625), (820, 938), (1502, 640)
B = (L[0] + R[0] - F[0], L[1] + R[1] - F[1])
poly = Image.new('L', (W, H), 0); ImageDraw.Draw(poly).polygon([L, F, R, B], fill=255); pp = poly.load()
# painted greens that are NOT background: a green-awning stripe, tree canopy, flower clusters, roof vines,
# the bush by the cart, the facade vines and the shrub left of the roof
PROTECT = [(550, 360, 610, 400), (1140, 115, 1465, 330), (88, 540, 265, 625), (925, 85, 1085, 250), (1330, 440, 1440, 625), (720, 280, 860, 360), (630, 200, 690, 270)]
protected = lambda x, y: any(a <= x < c and b <= y < d for a, b, c, d in PROTECT)
# grass lit yellow-green by the lantern hanging in the tree (hue down to 44 only here, away from the yellow bunting)
GLOW = [(1150, 355, 1290, 470)]
in_glow = lambda x, y: any(a <= x < c and b <= y < d for a, b, c, d in GLOW)
hsv = [None] * (W * H)
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]; h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); hsv[y * W + x] = (h * 360, s, v)
def grass(i):
    h, s, v = hsv[i]; return 72 <= h <= 105 and 0.55 <= s <= 0.87 and 0.15 <= v <= 0.6
def loose(i):
    h, s, v = hsv[i]; return 50 <= h <= 115 and s >= 0.4 and 0.05 <= v <= 0.85
inside = lambda x, y: pp[x, y] > 0
bg = bytearray(W * H)
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
def flood(seeds, allowed):
    q = deque(seeds); n = 0
    while q:
        x, y = q.popleft(); i = y * W + x
        if bg[i] or inside(x, y) or not allowed(x, y, i): continue
        bg[i] = 1; n += 1
        for dx, dy in N4:
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx]: q.append((nx, ny))
    return n
border = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
# 1. grass connected to the image border
n1 = flood(border, lambda x, y, i: grass(i))
# 2. enclosed grass patches (behind the bunting, banners and sign), outside the protected greens
seen = bytearray(W * H); n2 = 0
for y in range(H):
    for x in range(W):
        i = y * W + x
        if seen[i] or bg[i] or inside(x, y) or protected(x, y) or not grass(i): continue
        comp = []; q = deque([(x, y)]); seen[i] = 1
        while q:
            cx, cy = q.popleft(); comp.append(cy * W + cx)
            for dx, dy in N4:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < W and 0 <= ny < H:
                    j = ny * W + nx
                    if not seen[j] and not bg[j] and not inside(nx, ny) and not protected(nx, ny) and grass(j): seen[j] = 1; q.append((nx, ny))
        if len(comp) >= 150:
            for j in comp: bg[j] = 1
            n2 += len(comp)
# 3. darker / lighter grass next to the background, outside the protected greens
n3 = 0
q = deque()
for i in range(W * H):
    if bg[i]:
        x, y = i % W, i // W
        for dx, dy in N4:
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx]: q.append((nx, ny))
while q:
    x, y = q.popleft(); i = y * W + x
    if bg[i] or inside(x, y) or protected(x, y): continue
    h, sat, v = hsv[i]
    if not (loose(i) or (in_glow(x, y) and 44 <= h <= 115 and sat >= 0.4 and 0.05 <= v <= 0.9)): continue
    bg[i] = 1; n3 += 1
    for dx, dy in N4:
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx]: q.append((nx, ny))
# 4. smooth ragged edges: drop kept pixels outside the plaza with 3+ background neighbours (3 passes)
n4 = 0
for _ in range(3):
    rem = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            i = y * W + x
            if bg[i] or inside(x, y): continue
            if bg[i - 1] + bg[i + 1] + bg[i - W] + bg[i + W] >= 3: rem.append(i)
    for i in rem: bg[i] = 1
    n4 += len(rem)
o = Image.new('RGBA', (W, H)); op = o.load()
pv = Image.new('RGB', (W, H), (255, 0, 255)); vp = pv.load()
for y in range(H):
    for x in range(W):
        if not bg[y * W + x]:
            r, g, b = px[x, y]; op[x, y] = (r, g, b, 255); vp[x, y] = (r, g, b)
o.save(out); pv.save(preview)
print(f'border flood {n1}, enclosed {n2}, loose {n3}, smoothed {n4}; kept {W*H-sum(bg)}')
