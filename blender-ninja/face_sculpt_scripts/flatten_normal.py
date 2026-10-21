"""Flatten the tangent-space normal map under the face/neck skin (Meshy's baked normals there show up as
blocky light/dark patches per UV island).  Only image 'texture_0_normal' changes; everything else is copied.
usage: python3 flatten_normal.py IN.glb OUT.glb [preview.png]"""
import io, sys, json, struct
import numpy as np
from PIL import Image
exec(open(__file__.replace('flatten_normal.py', 'splice.py')).read().split("orig_p, new_p")[0])

src, dst = sys.argv[1:3]
j, b = load(src)
pr = j['meshes'][0]['primitives'][0]
P = acc(j, b, pr['attributes']['POSITION']); UV = acc(j, b, pr['attributes']['TEXCOORD_0'])
T = acc(j, b, pr['indices']).astype(np.int64).reshape(-1, 3)
img_i = {im['name']: i for i, im in enumerate(j['images'])}
def img_bytes(i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    return b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
NI = img_i['texture_0_normal']
nrm = np.array(Image.open(io.BytesIO(img_bytes(NI))))
alb = np.array(Image.open(io.BytesIO(img_bytes(img_i['texture_0']))).convert('RGB')).astype(float) / 255
H, W = nrm.shape[:2]
print('normal map', nrm.shape, nrm.dtype)

def skin(uv):
    x = np.clip((uv[:, 0] * W).astype(int), 0, W - 1); y = np.clip((uv[:, 1] * H).astype(int), 0, H - 1)
    c = alb[y, x]
    return (c[:, 0] > 0.28) & (c[:, 0] > c[:, 2] + 0.06)

# glTF: +Y up, +Z forward
tp = P[T]                                   # (n,3,3)
inzone = (tp[:, :, 1] > 1.455).all(1) & (tp[:, :, 2] > -0.02).all(1) & (np.abs(tp[:, :, 0]) < 0.1).all(1)
core = (tp[:, :, 1] > 1.505).all(1) & (tp[:, :, 1] < 1.645).all(1) & (tp[:, :, 2] > 0.055).all(1) & (np.abs(tp[:, :, 0]) < 0.058).all(1)
tuv = UV[T]
sk = np.stack([skin(tuv[:, k]) for k in range(3)] + [skin(tuv.mean(1))], 1).sum(1) >= 3
sel = (inzone & sk) | core
print('triangles flattened', sel.sum(), 'core', core.sum(), 'skin-zone', (inzone & sk).sum())

mask = np.zeros((H, W), bool)
for t in tuv[sel]:
    px = t * [W, H]
    x0, y0 = np.floor(px.min(0)).astype(int); x1, y1 = np.ceil(px.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
    if x1 < x0 or y1 < y0: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
    a, bb, c = px
    d = (bb[1] - c[1]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: continue
    l0 = ((bb[1] - c[1]) * (gx - c[0]) + (c[0] - bb[0]) * (gy - c[1])) / d
    l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
    l2 = 1 - l0 - l1
    e = -1.5 / max(np.linalg.norm(px - np.roll(px, 1, 0), axis=1).max(), 1)  # ~1.5 px edge tolerance
    inside = (l0 >= e) & (l1 >= e) & (l2 >= e)
    mask[y0:y1 + 1, x0:x1 + 1] |= inside
for _ in range(2):  # dilate 2 px (texture filtering at island edges)
    m = mask.copy()
    m[1:] |= mask[:-1]; m[:-1] |= mask[1:]; m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
    mask = m
print('pixels flattened', int(mask.sum()))
flat = np.array([128, 128, 255] + ([255] if nrm.shape[2] == 4 else []), nrm.dtype)
out = nrm.copy(); out[mask] = flat
if len(sys.argv) > 3:
    Image.fromarray((mask * 255).astype(np.uint8)).resize((1024, 1024)).save(sys.argv[3])
buf = io.BytesIO(); Image.fromarray(out).save(buf, 'PNG', compress_level=6); newpng = buf.getvalue()
print('png', len(img_bytes(NI)), '->', len(newpng))

# rebuild bin with the new image bytes
nbv = j['images'][NI]['bufferView']
outb = bytearray(); views = []
for vi, bv in enumerate(j['bufferViews']):
    while len(outb) % 4: outb.append(0)
    s = bv.get('byteOffset', 0)
    data = newpng if vi == nbv else b[s:s + bv['byteLength']]
    v = dict(bv); v['byteOffset'] = len(outb); v['byteLength'] = len(data); outb.extend(data); views.append(v)
while len(outb) % 4: outb.append(0)
j['bufferViews'] = views; j['buffers'] = [{'byteLength': len(outb)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(outb)))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(outb), b'BIN\x00')); f.write(outb)
print('wrote', dst)
