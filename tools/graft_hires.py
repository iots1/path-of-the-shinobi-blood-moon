"""Graft a raw hi-res Meshy body (T-pose, no rig) onto the rig of the current ninja.glb.

Takes the mesh attributes + the 3 images from RAW.glb, the skin weights dumped from Blender (dump_weights.npy rows in
RAW vertex order, columns = dump_names.json bone names), and keeps nodes / skin / inverse-bind matrices / the
Walking+Running clips / material of ORIG.glb byte-for-byte. The raw mesh is scaled to ORIG's height and put on the floor
(same transform that was applied in Blender before the weights were transferred).
TANGENT and _OUTLINE_NORMAL are dropped (three.js falls back to derivative tangents; run add_outline_normals.py LAST).
usage: python3 graft_hires.py ORIG.glb RAW.glb WEIGHTS_DIR OUT.glb [--check-co dump_co.npy]"""
import json, struct, sys
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
RT = {np.dtype(v): k for k, v in CT.items()}

def load(p):
    b = open(p, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L]); o = 20 + L
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, b[o + 8:o + 8 + bl]

def acc(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = CT[a['componentType']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    assert bv.get('byteStride') in (None, n * np.dtype(dt).itemsize)
    return np.frombuffer(bin_, dt, a['count'] * n, off).reshape(a['count'], n) if n > 1 else \
        np.frombuffer(bin_, dt, a['count'], off)

orig_p, raw_p, wdir, out_p = sys.argv[1:5]
jo, bo = load(orig_p); jr, br = load(raw_p)
po = jo['meshes'][0]['primitives'][0]; pr = jr['meshes'][0]['primitives'][0]
assert len(jo['meshes']) == 1 and len(jo['meshes'][0]['primitives']) == 1

# ---- mesh data from RAW, moved to ORIG's size/floor
P = acc(jr, br, pr['attributes']['POSITION']).astype(np.float32).copy()
NRM = acc(jr, br, pr['attributes']['NORMAL']).astype(np.float32).copy()
UV = acc(jr, br, pr['attributes']['TEXCOORD_0']).astype(np.float32).copy()
IDX = acc(jr, br, pr['indices']).astype(np.uint32).copy()
miny, maxy = float(P[:, 1].min()), float(P[:, 1].max())
s = 1.75 / (maxy - miny)
P *= s; P[:, 1] -= miny * s
print(f'raw verts {len(P)} tris {len(IDX)//3}; scale {s:.8f}; y {P[:,1].min():.3f}..{P[:,1].max():.3f}')

# ---- weights (from Blender), remapped to ORIG skin joint order
W = np.load(f'{wdir}/dump_weights.npy'); names = json.load(open(f'{wdir}/dump_names.json'))
assert W.shape == (len(P), len(names)), (W.shape, len(P), len(names))
if '--check-co' in sys.argv:   # Blender order check: blender (x, y, z) = gltf (x, -z, y)
    co = np.load(sys.argv[sys.argv.index('--check-co') + 1])
    d = np.abs(co - np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)).max()
    print('vertex order check vs Blender: max diff', d); assert d < 1e-4
jo_names = [jo['nodes'][k]['name'] for k in jo['skins'][0]['joints']]
assert sorted(jo_names) == sorted(names), 'joint sets differ'
remap = np.array([jo_names.index(n) for n in names])
top = np.argsort(-W, axis=1)[:, :4]
rows = np.arange(len(P))[:, None]
wt = W[rows, top]; wt = wt / wt.sum(1, keepdims=True)
J0 = remap[top].astype(CT[jo['accessors'][po['attributes']['JOINTS_0']]['componentType']])
W0 = wt.astype(np.float32)

# ---- images: RAW = [baseColor, metallicRoughness, normal]; ORIG textures expect [normal, baseColor, metallicRoughness]
mr_raw = jr['materials'][0]
src = lambda ti: jr['textures'][ti]['source']
img_order = [src(mr_raw['normalTexture']['index']),
             src(mr_raw['pbrMetallicRoughness']['baseColorTexture']['index']),
             src(mr_raw['pbrMetallicRoughness']['metallicRoughnessTexture']['index'])]
orig_tex_img = [jo['textures'][t['index']]['source'] for t in
                (jo['materials'][0]['normalTexture'], jo['materials'][0]['pbrMetallicRoughness']['baseColorTexture'],
                 jo['materials'][0]['pbrMetallicRoughness']['metallicRoughnessTexture'])]
assert orig_tex_img == [0, 1, 2], orig_tex_img
def raw_image(i):
    bv = jr['bufferViews'][jr['images'][i]['bufferView']]
    return br[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']], jr['images'][i]['mimeType']
new_imgs = [raw_image(i) for i in img_order]

# ---- drop TANGENT / _OUTLINE_NORMAL accessors (renumber the rest)
drop = set(po['attributes'].pop(k) for k in ('TANGENT', '_OUTLINE_NORMAL') if k in po['attributes'])
keep_acc = [i for i in range(len(jo['accessors'])) if i not in drop]
amap = {old: new for new, old in enumerate(keep_acc)}
def rn(i): return amap[i]
for k in po['attributes']: po['attributes'][k] = rn(po['attributes'][k])
po['indices'] = rn(po['indices'])
for a in jo.get('animations', []):
    for sm in a['samplers']: sm['input'] = rn(sm['input']); sm['output'] = rn(sm['output'])
for sk in jo['skins']:
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = rn(sk['inverseBindMatrices'])
jo['accessors'] = [jo['accessors'][i] for i in keep_acc]
mesh_acc = list(po['attributes'].values()) + [po['indices']]
# views still needed = everything the non-mesh accessors (clips, inverse-bind matrices) and the images use
other_views = set(a['bufferView'] for ai, a in enumerate(jo['accessors']) if ai not in mesh_acc and 'bufferView' in a)
other_views |= set(im['bufferView'] for im in jo['images'])

# ---- rebuild the binary: keep every other bufferView verbatim, append the new mesh + images
out = bytearray(); views = []; vmap = {}
def pad():
    while len(out) % 4: out.append(0)
for vi, bv in enumerate(jo['bufferViews']):
    if vi not in other_views: continue
    pad(); st = bv.get('byteOffset', 0)
    nb = dict(bv); nb['byteOffset'] = len(out); out.extend(bo[st:st + bv['byteLength']])
    vmap[vi] = len(views); views.append(nb)
def put(arr_or_bytes, target=None):
    pad()
    data = arr_or_bytes if isinstance(arr_or_bytes, (bytes, bytearray)) else np.ascontiguousarray(arr_or_bytes).tobytes()
    v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
    if target: v['target'] = target
    out.extend(data); views.append(v); return len(views) - 1

for ai, a in enumerate(jo['accessors']):
    if ai in mesh_acc: continue
    a['bufferView'] = vmap[a['bufferView']]
for im in jo['images']: im['bufferView'] = vmap[im['bufferView']]

NEW = {'POSITION': P, 'NORMAL': NRM, 'TEXCOORD_0': UV, 'JOINTS_0': J0, 'WEIGHTS_0': W0}
for k, ai in po['attributes'].items():
    arr = NEW[k]; a = jo['accessors'][ai]
    a['bufferView'] = put(arr, 34962); a['count'] = len(arr); a.pop('byteOffset', None)
    a['componentType'] = RT[arr.dtype]; a['type'] = {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[arr.shape[1]]
    a.pop('normalized', None)
    if k == 'POSITION': a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
ia = jo['accessors'][po['indices']]
ia['bufferView'] = put(IDX, 34963); ia['count'] = len(IDX); ia['componentType'] = 5125; ia.pop('byteOffset', None)
for im, (data, mime) in zip(jo['images'], new_imgs):
    im['bufferView'] = put(data); im['mimeType'] = mime
pad()
jo['bufferViews'] = views
jo['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(jo, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(out)
with open(out_p, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(out), b'BIN\x00')); f.write(out)
print('wrote', out_p, round(total / 1e6, 1), 'MB;', 'weights sum min/max', float(wt.sum(1).min()), float(wt.sum(1).max()))
