"""Ink-style shading painted into texture_0 from 3D positions (nostrils, alar crease, nose side walls).
Every texel of the face triangles is mapped back to its 3D point on the mesh (barycentric in UV), so the
paint lands exactly on the sculpted forms.  Coordinates in the feature list are Blender's (x, y=-gltfZ, z=gltfY).
usage: python3 paint_albedo.py IN.glb OUT.glb PAINT.json [ALBEDO_SOURCE.glb]
ALBEDO_SOURCE (default IN) supplies the unpainted texture_0, so re-running never paints twice."""
import io, sys, json, struct
import numpy as np
from PIL import Image
exec(open(__file__.replace('paint_albedo.py', 'splice.py')).read().split("orig_p, new_p")[0])

src, dst, pj = sys.argv[1:4]
asrc = sys.argv[4] if len(sys.argv) > 4 else src
FE = json.load(open(pj))
j, b = load(src)
ja, ba = load(asrc)
pr = j['meshes'][0]['primitives'][0]
P = acc(j, b, pr['attributes']['POSITION']); UV = acc(j, b, pr['attributes']['TEXCOORD_0'])
T = acc(j, b, pr['indices']).astype(np.int64).reshape(-1, 3)
def img(jj, bb, name):
    im = next(i for i in jj['images'] if i['name'] == name)
    bv = jj['bufferViews'][im['bufferView']]
    return bb[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
alb = np.array(Image.open(io.BytesIO(img(ja, ba, 'texture_0'))).convert('RGB')).astype(np.float32)
H, W = alb.shape[:2]
BP = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)   # Blender frame
NR = acc(j, b, pr['attributes']['NORMAL']); BN = np.stack([NR[:, 0], -NR[:, 2], NR[:, 1]], 1)

def blob(q, e, s):
    d = (q[:, 0] - e['x'] * s) ** 2 / e['sx'] ** 2 + (q[:, 2] - e['z']) ** 2 / e['sz'] ** 2
    if 'y' in e: d = d + (q[:, 1] - e['y']) ** 2 / e['sy'] ** 2
    return np.exp(-0.5 * d)
def sides(e): return (1, -1) if e.get('mirror', True) and e.get('x', 0) else (1,)
def sstep(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def factor(q, n=None):  # q: (n,3) Blender-frame points -> multiply factor (n,); 'down': only where the normal points down
    f = np.ones(len(q), np.float32)
    for e in FE:
        if 'mul' not in e: continue
        gate = sstep(*e['down'], -n[:, 2]) if ('down' in e and n is not None) else 1
        for s in sides(e):
            f *= 1 - (1 - e['mul']) * blob(q, e, s) * gate
    return f

# face triangles only (front of the head)
tp = BP[T]
sel = (tp[:, :, 2] > 1.54).all(1) & (tp[:, :, 2] < 1.64).all(1) & (np.abs(tp[:, :, 0]) < 0.045).all(1) & (tp[:, :, 1] < -0.07).all(1)
out = alb.copy(); done = np.zeros((H, W), bool); npx = 0
QY, QX, QP, QN = [], [], [], []
for t in T[sel]:
    px = UV[t] * [W, H]
    x0, y0 = np.floor(px.min(0)).astype(int); x1, y1 = np.ceil(px.max(0)).astype(int)
    x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0); x1, y1 = min(x1 + 1, W - 1), min(y1 + 1, H - 1)
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
    a, bb, c = px
    d = (bb[1] - c[1]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: continue
    l0 = ((bb[1] - c[1]) * (gx - c[0]) + (c[0] - bb[0]) * (gy - c[1])) / d
    l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
    l2 = 1 - l0 - l1
    e = -1.5 / max(np.linalg.norm(px - np.roll(px, 1, 0), axis=1).max(), 1)
    m = (l0 >= e) & (l1 >= e) & (l2 >= e) & ~done[y0:y1 + 1, x0:x1 + 1]
    if not m.any(): continue
    q = l0[m, None] * BP[t[0]] + l1[m, None] * BP[t[1]] + l2[m, None] * BP[t[2]]
    yy, xx = np.nonzero(m); yy += y0; xx += x0
    QY.append(yy); QX.append(xx); QP.append(q)
    QN.append(l0[m, None] * BN[t[0]] + l1[m, None] * BN[t[1]] + l2[m, None] * BN[t[2]])
    done[yy, xx] = True; npx += len(yy)
QY = np.concatenate(QY); QX = np.concatenate(QX); QP = np.concatenate(QP); QN = np.concatenate(QN)
QN /= np.maximum(np.linalg.norm(QN, axis=1, keepdims=True), 1e-9)
col = alb[QY, QX]
# skin reference = median colour of the nose bridge sides
ref = np.median(col[(np.abs(QP[:, 0]) > 0.004) & (np.abs(QP[:, 0]) < 0.013) & (QP[:, 2] > 1.596) & (QP[:, 2] < 1.612)], 0)
print('skin ref', ref.round(1))
w = np.zeros(len(QP), np.float32)
for e in [x for x in FE if 'clean' in x]:
    for sg in sides(e): w = np.maximum(w, e['clean'] * blob(QP, e, sg))
col = col * (1 - w[:, None]) + ref * w[:, None]
f = factor(QP, QN)
out[QY, QX] = col * f[:, None]
print('painted px', npx)
buf = io.BytesIO(); Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(buf, 'PNG', compress_level=6)
newpng = buf.getvalue()
ti = next(i for i, im in enumerate(j['images']) if im['name'] == 'texture_0')
nbv = j['images'][ti]['bufferView']
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
with open(dst, 'wb') as fo:
    fo.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(outb)))
    fo.write(struct.pack('<I4s', len(js), b'JSON')); fo.write(js)
    fo.write(struct.pack('<I4s', len(outb), b'BIN\x00')); fo.write(outb)
print('wrote', dst)
