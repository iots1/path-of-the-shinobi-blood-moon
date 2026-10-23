"""Graft an edited hi-res body (dumped from Blender) onto the rig of the current ninja.glb.
(Successor of graft_hires.py, which reads the raw glb directly; this one takes the Blender mesh incl. the grafted rebuilt hands.)

Takes the mesh attributes + the 3 images from RAW.glb, the skin weights dumped from Blender (dump_weights.npy rows in
RAW vertex order, columns = dump_names.json bone names), and keeps nodes / skin / inverse-bind matrices / the
Walking+Running clips / material of ORIG.glb byte-for-byte. The raw mesh is scaled to ORIG's height and put on the floor
(same transform that was applied in Blender before the weights were transferred).
TANGENT and _OUTLINE_NORMAL are dropped (three.js falls back to derivative tangents; run add_outline_normals.py LAST).
usage: python3 graft_mesh.py ORIG.glb DUMP_DIR OUT.glb  (DUMP_DIR: combo_dump.npz, combo_names.json, tex_base.jpg, tex_mr.jpg, tex_normal.jpg)"""
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

orig_p, ddir, out_p = sys.argv[1:4]
jo, bo = load(orig_p)
po = jo['meshes'][0]['primitives'][0]
assert len(jo['meshes']) == 1 and len(jo['meshes'][0]['primitives']) == 1

# ---- mesh data from the Blender dump: split vertices by (vertex, uv, normal) like the glTF exporter does
D = np.load(f'{ddir}/combo_dump.npz'); names = json.load(open(f'{ddir}/combo_names.json'))
Pb, lv, uvb, nrmb, tl, Wb = D['P'], D['lv'], D['uv'], D['nrm'], D['tl'], D['W']
key = np.concatenate([lv[:, None].astype(np.int64), np.round(uvb * 1e5).astype(np.int64), np.round(nrmb * 1e3).astype(np.int64)], 1)
_, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
inv = inv.ravel()
sel = lv[first]                                   # source vertex of each exported vertex
Pg = Pb[sel]; P = np.stack([Pg[:, 0], Pg[:, 2], -Pg[:, 1]], 1).astype(np.float32)          # Blender (x,y,z) -> glTF (x,z,-y)
Ng = nrmb[first]; NRM = np.stack([Ng[:, 0], Ng[:, 2], -Ng[:, 1]], 1).astype(np.float32)
NRM /= np.linalg.norm(NRM, axis=1, keepdims=True)
UV = np.stack([uvb[first, 0], 1.0 - uvb[first, 1]], 1).astype(np.float32)
IDX = inv[tl].ravel().astype(np.uint32)
W = Wb[sel]
print(f'vertices {len(P)} (from {len(Pb)}), tris {len(IDX)//3}, y {P[:,1].min():.3f}..{P[:,1].max():.3f}')
assert W.shape == (len(P), len(names))
jo_names = [jo['nodes'][k]['name'] for k in jo['skins'][0]['joints']]
assert sorted(jo_names) == sorted(names), 'joint sets differ'
remap = np.array([jo_names.index(n) for n in names])
top = np.argsort(-W, axis=1)[:, :4]
rows = np.arange(len(P))[:, None]
wt = W[rows, top]; wt = wt / wt.sum(1, keepdims=True)
J0 = remap[top].astype(CT[jo['accessors'][po['attributes']['JOINTS_0']]['componentType']])
W0 = wt.astype(np.float32)

# ---- images: files in the order ORIG's textures expect [normal, baseColor, metallicRoughness]
orig_tex_img = [jo['textures'][t['index']]['source'] for t in
                (jo['materials'][0]['normalTexture'], jo['materials'][0]['pbrMetallicRoughness']['baseColorTexture'],
                 jo['materials'][0]['pbrMetallicRoughness']['metallicRoughnessTexture'])]
assert orig_tex_img == [0, 1, 2], orig_tex_img
new_imgs = [(open(f'{ddir}/{n}', 'rb').read(), 'image/jpeg') for n in ('tex_normal.jpg', 'tex_base.jpg', 'tex_mr.jpg')]

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
