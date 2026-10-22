"""Repaint skin-coloured specks on HAIR triangles around the ears (Meshy texture: hair triangles whose UVs straddle the
ear's skin island show pink stripes/shards on the hair).  Per triangle in the 3D boxes: if most of its texels are dark
(hair), its skin-coloured texels get that triangle's median hair colour.  Texels also used by a skin-majority triangle
(the ear itself) are never touched.  Only image texture_0 changes.
usage: python3 fix_hair_specks.py IN.glb OUT.glb"""
import io, sys, json, struct
import numpy as np
from PIL import Image
exec(open(__file__.replace('fix_hair_specks.py', 'splice.py')).read().split("orig_p, new_p")[0])

BOXES = [  # Blender frame (x, y = -gltf z, z up): around each ear incl. the hair just behind/above it
    dict(x=(-0.115, -0.055), y=(-0.04, 0.08), z=(1.55, 1.69)),
    dict(x=(0.055, 0.115), y=(-0.04, 0.08), z=(1.55, 1.69))]
src, dst = sys.argv[1:3]
j, b = load(src)
pr = j['meshes'][0]['primitives'][0]
P = acc(j, b, pr['attributes']['POSITION']); UV = acc(j, b, pr['attributes']['TEXCOORD_0'])
T = acc(j, b, pr['indices']).astype(np.int64).reshape(-1, 3)
ti = next(i for i, im in enumerate(j['images']) if im['name'] == 'texture_0'); bv0 = j['bufferViews'][j['images'][ti]['bufferView']]
alb = np.array(Image.open(io.BytesIO(b[bv0['byteOffset']:bv0['byteOffset'] + bv0['byteLength']])).convert('RGB')).astype(np.float32)
H, W = alb.shape[:2]
BP = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
cen = BP[T].mean(1)
sel = np.zeros(len(T), bool)
for bx in BOXES:
    sel |= ((cen[:, 0] > bx['x'][0]) & (cen[:, 0] < bx['x'][1]) & (cen[:, 1] > bx['y'][0]) & (cen[:, 1] < bx['y'][1])
            & (cen[:, 2] > bx['z'][0]) & (cen[:, 2] < bx['z'][1]))
c01 = alb / 255
skin = ((c01[..., 0] - c01[..., 2]) > 0.06) & (c01[..., 0] > 0.30)
dark = c01.mean(2) < 0.20
warm = ((c01[..., 0] - c01[..., 2]) > 0.025) & (c01[..., 0] > 0.18)   # looser: only applied inside hair triangles
def raster(t):
    px = UV[t] * [W, H]
    x0, y0 = np.floor(px.min(0)).astype(int); x1, y1 = np.ceil(px.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
    if x1 < x0 or y1 < y0: return None
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
    a, bb, c = px; d = (bb[1] - c[1]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: return None
    l0 = ((bb[1] - c[1]) * (gx - c[0]) + (c[0] - bb[0]) * (gy - c[1])) / d
    l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
    m = (l0 >= -0.02) & (l1 >= -0.02) & (1 - l0 - l1 >= -0.02)
    yy, xx = np.nonzero(m); return yy + y0, xx + x0
tri_px = {}
protect = np.zeros((H, W), bool)
for k in np.nonzero(sel)[0]:
    r = raster(T[k])
    if r is None or len(r[0]) == 0: continue
    tri_px[k] = r
    if skin[r].mean() > 0.5: protect[r] = True          # the ear / skin: never touch its texels
out = alb.copy(); fixed = 0; tris = 0
for k, (yy, xx) in tri_px.items():
    if dark[yy, xx].mean() < 0.55: continue             # not a hair triangle
    bad = warm[yy, xx] & ~protect[yy, xx]
    if not bad.any(): continue
    hair = alb[yy, xx][dark[yy, xx]]
    out[yy[bad], xx[bad]] = np.median(hair, 0)
    fixed += int(bad.sum()); tris += 1
print(f'triangles in boxes {int(sel.sum())}, hair triangles fixed {tris}, texels repainted {fixed}')
buf = io.BytesIO(); Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(buf, 'PNG', compress_level=6); newpng = buf.getvalue()
nbv = j['images'][ti]['bufferView']; outb = bytearray(); views = []
for vi, bv in enumerate(j['bufferViews']):
    while len(outb) % 4: outb.append(0)
    s = bv.get('byteOffset', 0); data = newpng if vi == nbv else b[s:s + bv['byteLength']]
    v = dict(bv); v['byteOffset'] = len(outb); v['byteLength'] = len(data); outb.extend(data); views.append(v)
while len(outb) % 4: outb.append(0)
j['bufferViews'] = views; j['buffers'] = [{'byteLength': len(outb)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(dst, 'wb') as fo:
    fo.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(outb)))
    fo.write(struct.pack('<I4s', len(js), b'JSON')); fo.write(js)
    fo.write(struct.pack('<I4s', len(outb), b'BIN\x00')); fo.write(outb)
print('wrote', dst)
