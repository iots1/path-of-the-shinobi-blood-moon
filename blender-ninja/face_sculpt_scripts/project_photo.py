"""Project a front reference photo onto the face texture (texture_0).
Every face texel is mapped to its 3D point on the mesh; the point's front-projected (x, z) goes through a thin-plate
spline fitted on landmark pairs (model mm -> photo px), so the photo's eyes/brows/nose/mouth land on the model's.
Blend = facing-the-front x inside the photo's face outline (feathered) x not the model's hair; photo colours are
matched to the model's skin (mean/std per channel) so the face sits with the rest of the body.
usage: python3 project_photo.py IN.glb OUT.glb CFG.json"""
import io, sys, json, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
exec(open(__file__.replace('project_photo.py', 'splice.py')).read().split("orig_p, new_p")[0])

src, dst, cfgp = sys.argv[1:4]
C = json.load(open(cfgp))
j, b = load(src)
pr = j['meshes'][0]['primitives'][0]
P = acc(j, b, pr['attributes']['POSITION']); UV = acc(j, b, pr['attributes']['TEXCOORD_0'])
NR = acc(j, b, pr['attributes']['NORMAL'])
T = acc(j, b, pr['indices']).astype(np.int64).reshape(-1, 3)
def img(name):
    im = next(i for i in j['images'] if i['name'] == name)
    bv = j['bufferViews'][im['bufferView']]
    return b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
alb = np.array(Image.open(io.BytesIO(img('texture_0'))).convert('RGB')).astype(np.float32)
H, W = alb.shape[:2]
BP = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)     # Blender frame: x, y (front = -y), z up
BN = np.stack([NR[:, 0], -NR[:, 2], NR[:, 1]], 1)

# --- thin-plate spline: model (x mm, z mm) -> photo (u, v) px
ORG = np.array([0.0, 1600.0])   # centre model mm coords (conditioning)
src_pts = np.array([p[0] for p in C['pairs']], float) - ORG; dst_pts = np.array([p[1] for p in C['pairs']], float)
def U_(r2): return np.where(r2 > 0, r2 * np.log(np.maximum(r2, 1e-12)), 0.0)
n = len(src_pts)
K = U_(((src_pts[:, None] - src_pts[None]) ** 2).sum(-1)) + C.get('tps_lambda', 1.0) * np.eye(n)
Pm = np.hstack([np.ones((n, 1)), src_pts])
A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = Pm; A[n:, :n] = Pm.T
rhs = np.zeros((n + 3, 2)); rhs[:n] = dst_pts
coef = np.linalg.solve(A, rhs)
def tps(q):
    q = q - ORG
    k = U_(((q[:, None] - src_pts[None]) ** 2).sum(-1))
    return k @ coef[:n] + np.hstack([np.ones((len(q), 1)), q]) @ coef[n:]
res = tps(src_pts + ORG) - dst_pts
print('tps residual px max', float(np.abs(res).max()))

photo = Image.open(C['photo']).convert('RGB')
if C.get('sharpen'): photo = photo.filter(ImageFilter.UnsharpMask(*C['sharpen']))
PH = np.array(photo).astype(np.float32)
# face outline mask in photo px, feathered
mask_im = Image.new('L', photo.size, 0); ImageDraw.Draw(mask_im).polygon([tuple(p) for p in C['outline']], fill=255)
mask_im = mask_im.filter(ImageFilter.GaussianBlur(C.get('feather_px', 10)))
PM = np.array(mask_im).astype(np.float32) / 255
def sample(arr, u, v):
    h, w = arr.shape[:2]
    u = np.clip(u, 0, w - 1.001); v = np.clip(v, 0, h - 1.001)
    x0 = u.astype(int); y0 = v.astype(int); fx = u - x0; fy = v - y0
    if arr.ndim == 2: arr = arr[..., None]
    c = (arr[y0, x0] * ((1 - fx) * (1 - fy))[:, None] + arr[y0, x0 + 1] * (fx * (1 - fy))[:, None]
         + arr[y0 + 1, x0] * ((1 - fx) * fy)[:, None] + arr[y0 + 1, x0 + 1] * (fx * fy)[:, None])
    return c

# --- rasterise the face triangles in UV, keep texel -> 3D point + normal
tp = BP[T]
sel = (tp[:, :, 2] > 1.45).all(1) & (tp[:, :, 2] < 1.68).all(1) & (np.abs(tp[:, :, 0]) < 0.08).all(1) & (tp[:, :, 1] < -0.01).all(1)
if 'rect' in C:   # only triangles whose UVs lie in this atlas rect [px0, py0, w, h] (e.g. the face island)
    Rc = C['rect']; tuv = UV[T] * [W, H]
    sel &= ((tuv[:, :, 0] >= Rc[0]) & (tuv[:, :, 0] <= Rc[0] + Rc[2]) & (tuv[:, :, 1] >= Rc[1]) & (tuv[:, :, 1] <= Rc[1] + Rc[3])).all(1)
done = np.zeros((H, W), bool); QY, QX, QP, QN = [], [], [], []
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
    yy, xx = np.nonzero(m)
    QP.append(l0[m, None] * BP[t[0]] + l1[m, None] * BP[t[1]] + l2[m, None] * BP[t[2]])
    QN.append(l0[m, None] * BN[t[0]] + l1[m, None] * BN[t[1]] + l2[m, None] * BN[t[2]])
    yy += y0; xx += x0; QY.append(yy); QX.append(xx); done[yy, xx] = True
QY = np.concatenate(QY); QX = np.concatenate(QX); QP = np.concatenate(QP); QN = np.concatenate(QN)
QN /= np.maximum(np.linalg.norm(QN, axis=1, keepdims=True), 1e-9)
uvp = tps(np.stack([QP[:, 0] * 1000, QP[:, 2] * 1000], 1))
print('nan uv', int(np.isnan(uvp).any(1).sum()))
pc = sample(PH, uvp[:, 0], uvp[:, 1])
pm = sample(PM, uvp[:, 0], uvp[:, 1])[:, 0]
mc = alb[QY, QX]
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
facing = ss(*C.get('facing', [0.3, 0.7]), -QN[:, 1])
# the nose (incl. its down-facing base): take the photo even at grazing angles — from the front that IS the nose
nz = C.get('nose_zone')
if nz:
    inN = ss(nz['x'][1], nz['x'][0], np.abs(QP[:, 0])) * ss(nz['z'][0], nz['z'][0] + .004, QP[:, 2]) * ss(nz['z'][1], nz['z'][1] - .004, QP[:, 2])
    facing = np.maximum(facing, inN * ss(*nz['facing'], -QN[:, 1]) * (1 - ss(*nz.get('side', [0.55, 0.8]), np.abs(QN[:, 0]))))
    if 'down' in nz:   # the nose underside (nostrils) is painted separately: no front photo smeared over it
        facing *= 1 - inN * ss(*nz['down'], -QN[:, 2])
mlum = mc.mean(1)
# keep the model's own hair: dark texels, but only where hair can be (above the brows / at the temples) —
# the painted brows and eyes are dark too and must be replaced by the photo's
hairZone = np.maximum(ss(1.636, 1.644, QP[:, 2]), ss(0.048, 0.056, np.abs(QP[:, 0])) * ss(1.595, 1.605, QP[:, 2]))
notHair = 1 - hairZone * (1 - ss(*C.get('model_hair_lum', [45, 80]), mlum))
w = facing * pm * notHair * C.get('strength', 1.0)
# --- colour match photo -> model skin (stats over texels where the blend is strong, darkest 25% excluded)
core = w > 0.6
def stats(x):
    lum = x.mean(1); keep = lum > np.percentile(lum, 25)
    return x[keep].mean(0), x[keep].std(0)
mp, sp = stats(pc[core]); mm, sm = stats(mc[core])
ck = C.get('contrast_keep', 0.6)
tgt_s = sm * (1 - ck) + sp * ck
pcm = (pc - mp) / np.maximum(sp, 1) * tgt_s + mm + np.array(C.get('tint', [0, 0, 0]))
print('photo mean/std', mp.round(1), sp.round(1), ' model', mm.round(1), sm.round(1), ' texels', len(QY), 'blended>0.5', int((w > .5).sum()))
out = alb.copy()
out[QY, QX] = mc * (1 - w[:, None]) + pcm * w[:, None]
if 'preview' in C:
    pv = np.zeros((H, W), np.float32); pv[QY, QX] = w
    Image.fromarray((pv * 255).astype(np.uint8)).resize((1024, 1024)).save(C['preview'])
buf = io.BytesIO(); Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(buf, 'PNG', compress_level=6)
newpng = buf.getvalue()
ti = next(i for i, im in enumerate(j['images']) if im['name'] == 'texture_0'); nbv = j['images'][ti]['bufferView']
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
