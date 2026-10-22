"""Fill a new UV island with the texture it showed BEFORE the re-UV: every island texel -> its triangle's barycentric
coords -> the same triangle's OLD UVs (matched by vertex positions in OLD.glb) -> bilinear sample of the old texture_0.
Then dilates the island by `pad` px (mip/filter bleed).  Only texture_0 changes.
usage: python3 island_init.py NEW.glb OLD.glb OUT.glb px0 py0 w h [pad]"""
import io, sys, json, struct
import numpy as np
from PIL import Image
exec(open(__file__.replace('island_init.py', 'splice.py')).read().split("orig_p, new_p")[0])

new_p, old_p, out_p = sys.argv[1:4]
R = [int(v) for v in sys.argv[4:8]]; PAD = int(sys.argv[8]) if len(sys.argv) > 8 else 6
j, b = load(new_p); jo, bo = load(old_p)
def geo(jj, bb):
    pr = jj['meshes'][0]['primitives'][0]
    return (acc(jj, bb, pr['attributes']['POSITION']), acc(jj, bb, pr['attributes']['TEXCOORD_0']),
            acc(jj, bb, pr['indices']).astype(np.int64).reshape(-1, 3))
P, UV, T = geo(j, b); PO, UVO, TO = geo(jo, bo)
def img(jj, bb):
    im = next(i for i in jj['images'] if i['name'] == 'texture_0'); bv = jj['bufferViews'][im['bufferView']]
    return np.array(Image.open(io.BytesIO(bb[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']])).convert('RGB')).astype(np.float32)
alb = img(j, b); old = img(jo, bo); H, W = alb.shape[:2]
# match vertices by position with a tolerance (Blender rewrites floats; exact rounding splits some across a grid line)
CELL = 2e-5
grid = {}
for i, p in enumerate(PO): grid.setdefault(tuple(np.floor(p / CELL).astype(int)), []).append(i)
OFF = [(a, b_, c) for a in (-1, 0, 1) for b_ in (-1, 0, 1) for c in (-1, 0, 1)]
_pid = {}
def pid_of_old(i): return _pid.setdefault(tuple(np.round(PO[i] / CELL).astype(int)), len(_pid))
oid = np.array([pid_of_old(i) for i in range(len(PO))])
def key_new(p):
    c = np.floor(p / CELL).astype(int); best = None; bd = 1e9
    for o in OFF:
        for k in grid.get((c[0] + o[0], c[1] + o[1], c[2] + o[2]), ()):
            d = np.abs(PO[k] - p).max()
            if d < bd: bd, best = d, k
    return oid[best] if best is not None and bd < CELL else None
otri = {}
for t in TO:
    otri.setdefault(frozenset(oid[i] for i in t), t)
nkey_cache = {}
def sample(a, u, v):
    u = np.clip(u, 0, W - 1.001); v = np.clip(v, 0, H - 1.001); x0 = u.astype(int); y0 = v.astype(int); fx = u - x0; fy = v - y0
    return (a[y0, x0] * ((1 - fx) * (1 - fy))[:, None] + a[y0, x0 + 1] * (fx * (1 - fy))[:, None]
            + a[y0 + 1, x0] * ((1 - fx) * fy)[:, None] + a[y0 + 1, x0 + 1] * (fx * fy)[:, None])
px_all = UV * [W, H]
inR = lambda p: (p[:, 0] >= R[0]) & (p[:, 0] <= R[0] + R[2]) & (p[:, 1] >= R[1]) & (p[:, 1] <= R[1] + R[3])
isl = np.array([inR(px_all[t]).all() for t in T])
out = alb.copy(); filled = np.zeros((H, W), bool); miss = 0
for t in T[isl]:
    ks = [nkey_cache.setdefault(int(i), key_new(P[i])) for i in t]
    ot = otri.get(frozenset(ks)) if None not in ks else None
    if ot is None: miss += 1; continue
    # order the old triangle's corners like the new one
    omap = {oid[i]: i for i in ot}; ot = [omap[k] for k in ks]
    px = px_all[t]; opx = UVO[ot] * [W, H]
    x0, y0 = np.floor(px.min(0)).astype(int); x1, y1 = np.ceil(px.max(0)).astype(int)
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
    a, bb, c = px; d = (bb[1] - c[1]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: continue
    l0 = ((bb[1] - c[1]) * (gx - c[0]) + (c[0] - bb[0]) * (gy - c[1])) / d
    l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
    l2 = 1 - l0 - l1
    e = -0.6 / max(np.linalg.norm(px - np.roll(px, 1, 0), axis=1).max(), 1)
    m = (l0 >= e) & (l1 >= e) & (l2 >= e)
    if not m.any(): continue
    ou = l0[m] * opx[0, 0] + l1[m] * opx[1, 0] + l2[m] * opx[2, 0]
    ov = l0[m] * opx[0, 1] + l1[m] * opx[1, 1] + l2[m] * opx[2, 1]
    yy, xx = np.nonzero(m); yy += y0; xx += x0
    out[yy, xx] = sample(old, ou - .5, ov - .5); filled[yy, xx] = True
# dilate the island by PAD px
cur = filled.copy()
for _ in range(PAD):
    nb = np.zeros_like(cur); acc_c = np.zeros_like(out); cnt = np.zeros((H, W), np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(cur, dy, 0), dx, 1); shc = np.roll(np.roll(out, dy, 0), dx, 1)
        add = sh & ~cur; acc_c[add] += shc[add]; cnt[add] += 1; nb |= add
    out[nb] = acc_c[nb] / cnt[nb][:, None]; cur |= nb
# the rest of the rect: island mean colour (mip levels average the rect with whatever surrounds the island; black bled in)
rx0, ry0, rw, rh = R
blk = ~cur[ry0:ry0 + rh, rx0:rx0 + rw]
meanc = out[filled].mean(0)
sub = out[ry0:ry0 + rh, rx0:rx0 + rw]; sub[blk] = meanc; out[ry0:ry0 + rh, rx0:rx0 + rw] = sub
print(f'island triangles {int(isl.sum())}, unmatched {miss}, texels filled {int(filled.sum())}, padded {int((cur & ~filled).sum())}')
buf = io.BytesIO(); Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(buf, 'PNG', compress_level=6); newpng = buf.getvalue()
ti = next(i for i, im in enumerate(j['images']) if im['name'] == 'texture_0'); nbv = j['images'][ti]['bufferView']
outb = bytearray(); views = []
for vi, bv in enumerate(j['bufferViews']):
    while len(outb) % 4: outb.append(0)
    s0 = bv.get('byteOffset', 0); data = newpng if vi == nbv else b[s0:s0 + bv['byteLength']]
    v = dict(bv); v['byteOffset'] = len(outb); v['byteLength'] = len(data); outb.extend(data); views.append(v)
while len(outb) % 4: outb.append(0)
j['bufferViews'] = views; j['buffers'] = [{'byteLength': len(outb)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(out_p, 'wb') as fo:
    fo.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(outb)))
    fo.write(struct.pack('<I4s', len(js), b'JSON')); fo.write(js)
    fo.write(struct.pack('<I4s', len(outb), b'BIN\x00')); fo.write(outb)
print('wrote', out_p)
