"""
Clears the generator's background haze from the Ancient Temple painting.

    python3 -I scripts/cutout-temple.py art-source/raw/buildings/temple_original.png \\
        art-source/raw/buildings/temple.png <preview.png>

The painting already has real transparency, but the generator left a semi-transparent glow:
a faint halo all round (alpha 1-15, which `npm run art:import` removes as haze) and a milky,
half-transparent fill inside the arch openings (alpha roughly 60-210). This script clears
every semi-transparent AREA: pixels with 0 < alpha <= 210 that are still semi-transparent after
a 2-pixel erosion, together with the semi-transparent region connected to them. The thin
anti-aliased outline of the stones (1-2 px) survives the erosion test and is kept. Opaque
pixels and all colours are unchanged. Needs Pillow; deterministic.
"""
import sys
from collections import deque
from PIL import Image
src, out, preview = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGBA'); W, H = im.size
data = bytearray(im.tobytes())
A = lambda i: data[i * 4 + 3]
semi = bytearray(1 if 0 < A(i) <= 210 else 0 for i in range(W * H))
N4 = (1, -1, W, -W)
def erode(m):
    o = bytearray(W * H)
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            i = y * W + x
            if m[i] and all(m[i + d] for d in N4): o[i] = 1
    return o
core = erode(erode(semi))
clear = bytearray(W * H); q = deque(i for i in range(W * H) if core[i])
for i in q: clear[i] = 1
while q:
    i = q.popleft(); x = i % W
    for d in N4:
        j = i + d
        if j < 0 or j >= W * H or (d == 1 and x == W - 1) or (d == -1 and x == 0): continue
        if semi[j] and not clear[j]: clear[j] = 1; q.append(j)
n = 0
for i in range(W * H):
    if clear[i]:
        data[i * 4:i * 4 + 4] = b'\x00\x00\x00\x00'; n += 1
res = Image.frombytes('RGBA', (W, H), bytes(data)); res.save(out)
pv = Image.new('RGBA', (W, H), (255, 0, 255, 255)); pv.alpha_composite(res); pv.convert('RGB').save(preview)
print(f'cleared {n} semi-transparent px (areas), kept {sum(1 for i in range(W*H) if data[i*4+3])} px')
