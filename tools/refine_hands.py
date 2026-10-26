"""Hand detail pass (2026-10-25): woven glove cloth (the mask's knit) + fingernails / knuckle creases on the bare fingers.
usage: python3 refine_hands.py IN.glb OUT_DIR [--probe]   (IN = assets/raw/ninja-before-hand-detail-2026-10-25.glb: it finds the OLD flat patches by their UVs, so it cannot be re-run on its own output)
Reads the current ninja.glb (rebuilt hands: flat glove / skin patches), re-UVs ONLY the triangles of those two patches
and paints new tiles into free atlas rectangles (the UV islands of the raw Meshy hands, unused since the wrist cut):
  glove  : periodic knit tile (period 95 px = 10 knit cells, from the mask's weave pitch 9.5 px), cylindrical coordinates
           round the hand axis, each triangle shifted into the tile by whole periods (the tile is periodic, so no seam).
  fingers: ONE shared strip for the 4 fingers (u = angle round the finger from the dorsal side, v = distance from the tip,
           piecewise by the finger's own joints so creases/nails land on every finger), a second strip for the thumb.
Writes OUT_DIR/combo_dump.npz + combo_names.json (the graft_mesh.py input; the mesh is the glb's own, only UVs change)
and tex_normal.jpg / tex_base.jpg / tex_mr.jpg.  Then: python3 graft_mesh.py IN.glb OUT_DIR OUT.glb; add_outline_normals.py LAST."""
import sys, io, json, struct
import numpy as np
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from glb_io import load, acc, node_world

TS = 4096
# free atlas rectangles (x, y_from_top, w, h) @4096 — raw-hand islands not referenced by any triangle (see the note)
R_GLOVE, R_FINGER, R_THUMB = (1794, 1256, 142, 150), (3734, 982, 110, 238), (1812, 3232, 106, 212)
KNIT_N = 95                    # knit tile period (px)
KNIT_D = 3960.0                # glove texel density (px / m): 9.5 px knit pitch = 2.4 mm
GLOVE_R = 0.03                 # radius used to turn the glove angle into length
F_PX = [104, 62, 50, 6]        # finger strip: px per segment prox(1-2), mid(2-3), dist(3-4), tip extension (joint 4 IS the tip surface)
T_PX = [60, 62, 50, 6]
F_W, T_W, PADU, BORDER = 96, 90, 12, 3
NAIL_TH, NAIL_V0, NAIL_V1 = 0.72, 8.0, 38.0     # nail half width (rad), free edge / cuticle (px from the polyline end)
THUMB_AWAY = 0.6               # thumb nail normal = dorsal + this * (away from the index line)
SKIN = (217, 166, 145)
PROBE = '--probe' in sys.argv

inp, outd = sys.argv[1:3]
j, bin_ = load(inp); po = j['meshes'][0]['primitives'][0]
P = acc(j, bin_, po['attributes']['POSITION']).astype(np.float64)
N = acc(j, bin_, po['attributes']['NORMAL']).astype(np.float64)
UV = acc(j, bin_, po['attributes']['TEXCOORD_0']).astype(np.float64)
J0 = acc(j, bin_, po['attributes']['JOINTS_0']).astype(np.int64)
W0 = acc(j, bin_, po['attributes']['WEIGHTS_0']).astype(np.float64)
I = acc(j, bin_, po['indices']).astype(np.int64).reshape(-1, 3)
u0, v0 = UV[:, 0], 1 - UV[:, 1]
gv = (abs(u0 - .2642) < .0075) & (abs(v0 - .646) < .0105)      # old flat glove patch (UV from bottom)
sv = (abs(u0 - .4228) < .0055) & (abs(v0 - .2852) < .0105)     # old flat skin patch
tg, ts = gv[I].all(1), sv[I].all(1)
print('glove tris', tg.sum(), 'skin tris', ts.sum())
import builtins

# ---- bones (bind pose = node world)
WM = node_world(j); nm = {n['name']: i for i, n in enumerate(j['nodes'])}
pos = lambda n: WM[nm['mixamorig:' + n]][:3, 3].copy()
def unit(v): return v / np.linalg.norm(v)
FING = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']

def side_data(side):
    h = pos(side + 'Hand'); mid = pos(side + 'HandMiddle1'); a = unit(mid - h)
    ch = {f: [pos(f'{side}Hand{f}{k}') for k in range(1, 5)] for f in FING}
    Rm = WM[nm['mixamorig:' + side + 'Hand']][:3, :3]
    sgn = -1.0 if side == 'Right' else 1.0       # note: palm side = -x_local on the right hand, +x on the left
    d = unit(Rm[:, 0] * (-sgn))                  # dorsal normal (hand-local x)
    d = unit(d - a * d.dot(a))
    return dict(h=h, a=a, ch=ch, d=d, xs=np.sign(h[0]))
SD = {s: side_data(s) for s in ('Right', 'Left')}
if PROBE:
    for s, D in SD.items(): print(s, 'hand', D['h'].round(3), 'axis', D['a'].round(3), 'dorsal', D['d'].round(3))

def polyline(chain, ext):
    pts = [chain[0], chain[1], chain[2], chain[3]]
    tip = chain[3] + unit(chain[3] - chain[2]) * ext
    return pts + [tip]

def project(Pt, pl):
    """closest point on the polyline: returns (dist, seg index, t in segment, point)"""
    best = None
    for k in range(len(pl) - 1):
        a, b = pl[k], pl[k + 1]; ab = b - a; L2 = ab.dot(ab)
        t = np.clip(((Pt - a) * ab).sum(1) / L2, 0, 1)
        q = a + t[:, None] * ab; d = np.linalg.norm(Pt - q, axis=1)
        cur = (d, np.full(len(Pt), k), t, q)
        if best is None: best = [c.copy() for c in cur]
        else:
            m = d < best[0]
            for c, n_ in zip(best, cur): c[m] = n_[m]
    return best

# ---- vertices of the skin patch: owner finger, (theta, v) in strip px
sk_idx = np.unique(I[ts])
sk_side = np.where(P[sk_idx, 0] * SD['Right']['xs'] > 0, 'Right', 'Left')
VR = np.zeros(len(P)); VTH = np.zeros(len(P)); VV = np.zeros(len(P)); VOWN = np.full(len(P), -1); VSEG = np.zeros(len(P))
for side in ('Right', 'Left'):
    D = SD[side]; idx = sk_idx[sk_side == side]; Pt = P[idx]
    cand = []
    EXT = 0.012
    for f in FING:
        pl = polyline(D['ch'][f], EXT + .03)      # long extension: ownership only
        d = project(Pt, pl)[0]; cand.append(d)
    own = np.argmin(np.array(cand), 0)
    for fi, f in enumerate(FING):
        sel = idx[own == fi]
        if not len(sel): continue
        ch = D['ch'][f]; thumb = f == 'Thumb'
        # tip extension = how far the skin reaches past joint 4 along the finger
        ax = unit(ch[3] - ch[2]); ext = max(((P[sel] - ch[3]) @ ax).max(), 0.004)
        pl = polyline(ch, ext)
        dist, seg, t, q = project(P[sel], pl)
        segpx = T_PX if thumb else F_PX
        seglen = [np.linalg.norm(pl[k + 1] - pl[k]) for k in range(4)]
        ycum = np.concatenate([[0], np.cumsum(segpx)])
        y = ycum[seg] + t * np.array(segpx)[seg]           # px from the MCP side
        # beyond the first / last segment ends: the skin patch may start before joint 1 — extend linearly
        a0 = pl[1] - pl[0]; before = ((P[sel] - pl[0]) @ unit(a0))
        ext_px = np.where((seg == 0) & (t == 0), before / seglen[0] * segpx[0], 0)     # negative = before joint 1
        y = y + ext_px
        v = ycum[-1] - y                                    # distance from the tip (px)
        # angle round the finger from the dorsal side
        a = unit(pl[seg][:, 0:3][0]) if False else None
        axis = np.array([unit(pl[k + 1] - pl[k]) for k in range(4)])[seg]
        dd = D['d']
        if thumb:
            idxline = project(pl[2][None], polyline(D['ch']['Index'], .05))[3][0]
            away = unit((pl[2] - idxline) - ax * (pl[2] - idxline).dot(ax))
            dd = unit(D['d'] + THUMB_AWAY * away)
        dorsal = dd[None, :] - axis * (axis @ dd)[:, None]; dorsal /= np.linalg.norm(dorsal, axis=1, keepdims=True)
        side_v = np.cross(axis, dorsal)
        r = P[sel] - q
        th = np.arctan2((r * side_v).sum(1), (r * dorsal).sum(1))
        VTH[sel] = th; VV[sel] = v; VR[sel] = np.linalg.norm(r, axis=1); VOWN[sel] = fi
        if PROBE: print(side, f, len(sel), 'ext mm', round(ext * 1000, 1), 'v range', v.min().round(1), v.max().round(1), 'dist max mm', (dist.max() * 1000).round(1))

if PROBE:
    for side in ('Right', 'Left'):
        for fi, f in enumerate(FING):
            m = (VOWN == fi) & (np.abs(VTH) < .3) & (VV > 10) & (VV < 36) & (P[:, 0] * SD[side]['xs'] > 0)
            print(side, f, int(m.sum()), int((VOWN == fi).sum()))
            if m.any():
                ch = SD[side]['ch'][f]; c = P[m].mean(0); ax = unit(ch[3] - ch[2]); mid = (ch[2] + ch[3]) / 2
                dv = c - mid; dv -= ax * dv.dot(ax); print(side, f, 'nail dir', unit(dv).round(2), 'axis', ax.round(2))
# ---- new UVs per loop (glTF convention, v from top), starting from the old ones
LU = UV[I].copy()                       # (T,3,2)
def place(x0, y0, w, h, ux, vy):
    return np.stack([(x0 + BORDER + ux) / TS, (y0 + BORDER + vy) / TS], -1)

wrap = lambda d: (d + np.pi) % (2 * np.pi) - np.pi
def strip_uv(tris, W, rect, pad_need):
    x0, y0, rw, rh = rect
    out = np.zeros((len(tris), 3, 2)); bad = 0
    for n, tri in enumerate(tris):
        th = VTH[tri]; th = th[0] + wrap(th - th[0])
        if np.ptp(th) > np.pi / 3: th[:] = VTH[tri][np.argmax(VR[tri])]     # triangle on the tip pole: angle is meaningless, use the outermost vertex
        ux = (th + np.pi) / (2 * np.pi) * W
        ux = ux - W * np.floor(ux.min() / W)
        vy = VV[tri] + 7.0
        if ux.max() > W + PADU - 1 or vy.min() < 0 or vy.max() > rh - 2 * BORDER:
            bad += 1; ux = np.clip(ux, 0, W + PADU - 1); vy = np.clip(vy, 0, rh - 2 * BORDER)
        out[n] = place(x0, y0, rw, rh, ux, vy)
    return out, bad

sk_tris = np.where(ts)[0]
own_t = VOWN[I[sk_tris]]
for thumb, W, rect in ((False, F_W, R_FINGER), (True, T_W, R_THUMB)):
    m = (own_t[:, 0] == 4) if thumb else (own_t[:, 0] != 4)
    uv_, bad = strip_uv(I[sk_tris[m]], W, rect, PADU)
    LU[sk_tris[m]] = uv_
    print('thumb' if thumb else 'fingers', m.sum(), 'tris, out-of-rect', bad)

# glove: cylinder round the hand axis, shifted into the knit tile by whole periods
gl = np.where(tg)[0]
gside = np.where(P[I[gl, 0], 0] * SD['Right']['xs'] > 0, 0, 1)
badg = 0
for n, ti in enumerate(gl):
    D = SD['Right' if gside[n] == 0 else 'Left']; tri = I[ti]
    rel = P[tri] - D['h']; s = rel @ D['a']; r = rel - s[:, None] * D['a']
    dors = D['d']; sv_ = np.cross(D['a'], dors)
    th = np.arctan2(r @ sv_, r @ dors); th = th[0] + wrap(th - th[0])
    ux = th * GLOVE_R * KNIT_D; vy = s * KNIT_D
    ux = ux - KNIT_N * np.floor(ux.min() / KNIT_N); vy = vy - KNIT_N * np.floor(vy.min() / KNIT_N)
    if ux.max() > R_GLOVE[2] - 2 * BORDER or vy.max() > R_GLOVE[3] - 2 * BORDER: badg += 1
    LU[ti] = place(*R_GLOVE, np.clip(ux, 0, R_GLOVE[2] - 2 * BORDER), np.clip(vy, 0, R_GLOVE[3] - 2 * BORDER))
print('glove tris', len(gl), 'out-of-rect', badg)

# ---- textures -------------------------------------------------------------------------------------------------------
def img(i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]; s = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(bin_[s:s + bv['byteLength']])).convert('RGB')
nrm_im, base_im, mr_im = img(0), img(1), img(2)       # ninja.glb order [normal, baseColor, metallicRoughness]
nrm, base, mr = (np.asarray(x).astype(np.float64) for x in (nrm_im, base_im, mr_im))
rng = np.random.default_rng(7)

def bump_normal(h, k):
    gy, gx = np.gradient(h)                 # d/drow, d/dcol
    n = np.stack([-gx * k, gy * k, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n

def put(arr, rect, scale, patch):
    x0, y0, w, h = [int(round(c * scale)) for c in rect]
    arr[y0:y0 + h, x0:x0 + w] = patch[:h, :w] if patch.shape[0] >= h else patch

def knit_tile():
    T = np.zeros((KNIT_N, KNIT_N)); c = KNIT_N / 10.0
    yy, xx = np.mgrid[0:KNIT_N, 0:KNIT_N].astype(float)
    for a in range(10):
        for b in range(10):
            cx = (a + .5) * c + rng.normal(0, .35); cy = (b + .5) * c + rng.normal(0, .35); amp = rng.uniform(.55, 1.0)
            dx = (xx - cx + KNIT_N / 2) % KNIT_N - KNIT_N / 2; dy = (yy - cy + KNIT_N / 2) % KNIT_N - KNIT_N / 2
            T += amp * np.exp(-(dx * dx / (2 * 1.35 ** 2) + dy * dy / (2 * 1.15 ** 2)))
    # thread lines between the dots (periodic)
    T += .22 * (np.cos(2 * np.pi * yy / c) * .5 + .5) * .6 + .18 * (np.cos(2 * np.pi * xx / c) * .5 + .5) * .6
    return np.clip(T / T.max(), 0, 1)
KT = knit_tile()

def paint_glove():
    w, h = R_GLOVE[2], R_GLOVE[3]
    yy, xx = np.mgrid[0:h, 0:w]
    H = KT[(yy - BORDER) % KNIT_N, (xx - BORDER) % KNIT_N]
    lo, hi = np.array([26, 28, 28.]), np.array([118, 128, 132.])       # the mask's own thread / highlight colours
    col = lo + (hi - lo) * (H ** 1.6)[..., None]
    n = bump_normal(H, 2.2)
    return col, (n * .5 + .5) * 255, H

def paint_strip(rect, W, segpx, thumb):
    w, h = rect[2], rect[3]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    th = (xx - BORDER) / W * 2 * np.pi - np.pi          # periodic in 2*pi (pad columns continue it)
    v = yy - BORDER - 7.0                               # px from the tip
    cth = np.cos(th)                                    # +1 dorsal, -1 palm
    pal = (1 - cth) / 2
    col = np.zeros((h, w, 3)); dors, palm = np.array([205., 156., 135.]), np.array([226., 170., 152.])
    col = dors + (palm - dors) * pal[..., None]
    # slightly yellower, darker knuckle skin over the joints
    ycum = np.cumsum([segpx[3], segpx[2], segpx[1]])     # joint positions from the tip: DIP, PIP, MCP-side
    height = np.zeros((h, w))
    for jn, yj in enumerate(ycum[:2]):
        dv = v - yj
        groove = np.exp(-(dv ** 2) / (2 * 1.1 ** 2))
        palm_w = np.clip((1 - cth - .6) / .8, 0, 1)
        col -= (groove * palm_w * 34)[..., None] * np.array([1., 1.15, 1.2])
        height -= groove * palm_w * 1.0
        # dorsal knuckle wrinkles: three lines, strongest over the middle of the back
        dors_w = np.clip((cth - .1) / .9, 0, 1) ** 1.5
        for off, a in ((-4.5, .55), (0, 1.0), (4.5, .55)):
            wk = np.exp(-((dv - off) ** 2) / (2 * .9 ** 2))
            wrk = wk * dors_w * a * (1 + .25 * np.sin(th * 17 + jn))
            col -= (wrk * 24)[..., None] * np.array([1., 1.1, 1.15]); height -= wrk * .8
        bump = np.exp(-(dv ** 2) / (2 * 6.0 ** 2)) * dors_w            # knuckle swells under the lines
        col += (bump * 7)[..., None] * np.array([1., .5, .2]); height += bump * .5
    # tip pole: the angle is undefined there, so the last few px are one flat skin colour (no facets in the cap)
    tf = np.clip((10.0 - v) / 4.0, 0, 1)
    col = col * (1 - tf[..., None]) + ((dors + palm) / 2 + np.array([4., 0., 0.]))[None, None, :] * tf[..., None]
    height = height * (1 - tf)
    # skin noise
    nz = rng.normal(0, 1, (h, w)); nz = (nz + np.roll(nz, 1, 0) + np.roll(nz, 1, 1)) / 3
    col += (nz * 3.5)[..., None]; height += nz * .06
    # nail: rounded rectangle, free edge, lunula, cuticle fold
    cv = (NAIL_V0 + NAIL_V1) / 2; hv = (NAIL_V1 - NAIL_V0) / 2
    q = (np.abs(th) / NAIL_TH) ** 3 + (np.abs(v - cv) / hv) ** 3.5
    inside = q < 1.0
    edge = np.clip((1 - q) / .16, 0, 1)                   # 0 at the border, 1 inside
    free = np.clip((NAIL_V0 + 5.0 - v) / 4.0, 0, 1) * inside   # pale free edge near the tip
    nail = np.array([212., 148., 138.]) + 0 * col
    ridge = np.sin(th * 16) * 1.5
    nail = nail + ridge[..., None] * np.array([1, 1, 1.])
    lun = np.exp(-((v - (NAIL_V1 - 4.5)) ** 2) / (2 * 3.0 ** 2)) * np.clip(1 - (np.abs(th) / .5) ** 2, 0, 1)
    nail = nail + (lun * 26)[..., None] * np.array([1., 1.15, 1.2])
    nail = nail + (free * 28)[..., None] * np.array([1., 1.35, 1.35])
    col = col * (1 - inside[..., None] * edge[..., None]) + nail * (inside[..., None] * edge[..., None])
    # cuticle fold / side folds: dark soft ring just outside the plate, raised plate inside
    ring = np.exp(-((q - 1.12) ** 2) / (2 * .07 ** 2)) * (v < NAIL_V1 + 8) * (v > NAIL_V0 - 3)
    col -= (ring * 26)[..., None] * np.array([1., 1.2, 1.25]); height -= ring * .9
    height += edge * inside * .9 * (1 - free * .3)
    col = np.clip(col, 0, 255)
    n = bump_normal(height, 1.7)
    rough = 160 - inside * edge * 55                     # MR green = roughness; nail is glossier
    return col, (n * .5 + .5) * 255, rough, height

def blend_paint(col_target, nrm_target, rect, col, n_, extra=None):
    x0, y0, w, h = rect
    col_target[y0:y0 + h, x0:x0 + w] = col; nrm_target[y0:y0 + h, x0:x0 + w] = n_

gcol, gnrm, gH = paint_glove()
blend_paint(base, nrm, R_GLOVE, gcol, gnrm)
# glove MR: cloth values of the old patch (255,125,3) with a little height-driven roughness
x0, y0, w, h = [c // 2 for c in R_GLOVE]
gm = np.zeros((h, w, 3)); gm[..., 0] = 255; gm[..., 1] = 125 + 20 * (1 - gH[::2, ::2][:h, :w]); gm[..., 2] = 3
mr[y0:y0 + h, x0:x0 + w] = gm
for rect, W, px, thumb in ((R_FINGER, F_W, F_PX, False), (R_THUMB, T_W, T_PX, True)):
    c_, n_, rgh, hh = paint_strip(rect, W, px, thumb)
    blend_paint(base, nrm, rect, c_, n_)
    x0, y0, w, h = [c // 2 for c in rect]
    m_ = np.zeros((h, w, 3)); m_[..., 0] = 255; m_[..., 1] = rgh[::2, ::2][:h, :w]; m_[..., 2] = 0
    mr[y0:y0 + h, x0:x0 + w] = m_

import os
os.makedirs(outd, exist_ok=True)
for a, nme in ((nrm, 'tex_normal.jpg'), (base, 'tex_base.jpg'), (mr, 'tex_mr.jpg')):
    Image.fromarray(np.clip(a, 0, 255).astype('uint8')).save(f'{outd}/{nme}', quality=95, subsampling=0)
if PROBE:
    for nme, rect in (('glove', R_GLOVE), ('finger', R_FINGER), ('thumb', R_THUMB)):
        x0, y0, w, h = rect
        Image.fromarray(np.clip(base[y0:y0 + h, x0:x0 + w], 0, 255).astype('uint8')).resize((w * 3, h * 3), Image.NEAREST).save(f'{outd}/probe_{nme}.png')

# ---- dump for graft_mesh.py (Blender-style: z up, v from the bottom, per-loop uv / normal) ---------------------------
Pb = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
Nb = np.stack([N[:, 0], -N[:, 2], N[:, 1]], 1)
lv = I.ravel(); uvb = np.stack([LU[..., 0].ravel(), 1 - LU[..., 1].ravel()], 1)
jn = [j['nodes'][k]['name'] for k in j['skins'][0]['joints']]
Wd = np.zeros((len(P), len(jn)), np.float32)
for k in range(4): np.add.at(Wd, (np.arange(len(P)), J0[:, k]), W0[:, k].astype(np.float32))
np.savez(f'{outd}/combo_dump.npz', P=Pb, lv=lv, uv=uvb, nrm=Nb[lv], tl=np.arange(len(lv)).reshape(-1, 3), W=Wd)
json.dump(jn, open(f'{outd}/combo_names.json', 'w'))
print('wrote', outd)
