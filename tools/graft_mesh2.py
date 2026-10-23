"""Graft the raw hi-res body (dumped from Blender, incl. re-weighted hands) onto the rig of the current ninja.glb AND move the
finger bones of both hands onto the chains fitted to the raw hands (chains3_<side>.json, Blender coords).
(Successor of graft_mesh.py, which keeps the skeleton untouched.)

Takes the mesh attributes + the 3 images from RAW.glb, the skin weights dumped from Blender (dump_weights.npy rows in
RAW vertex order, columns = dump_names.json bone names), and keeps nodes / skin / inverse-bind matrices / the
Walking+Running clips / material of ORIG.glb byte-for-byte. The raw mesh is scaled to ORIG's height and put on the floor
(same transform that was applied in Blender before the weights were transferred).
TANGENT and _OUTLINE_NORMAL are dropped (three.js falls back to derivative tangents; run add_outline_normals.py LAST).
usage: python3 graft_mesh2.py ORIG.glb DUMP_DIR RAW.glb OUT.glb  (DUMP_DIR: raw_dump.npz, raw_names.json, chains3_Right/Left.json; images are taken from RAW.glb)"""
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

orig_p, ddir, raw_p, out_p = sys.argv[1:5]
jo, bo = load(orig_p)
po = jo['meshes'][0]['primitives'][0]
assert len(jo['meshes']) == 1 and len(jo['meshes'][0]['primitives']) == 1

# ---- mesh data from the Blender dump: split vertices by (vertex, uv, normal) like the glTF exporter does
D = np.load(f'{ddir}/raw_dump.npz'); names = json.load(open(f'{ddir}/raw_names.json'))
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

# ---- images straight from the raw glb: raw = [baseColor, metallicRoughness, normal]; ORIG textures expect [normal, baseColor, metallicRoughness]
jr, br = load(raw_p); mr_raw = jr['materials'][0]
src = lambda ti: jr['textures'][ti]['source']
img_order = [src(mr_raw['normalTexture']['index']), src(mr_raw['pbrMetallicRoughness']['baseColorTexture']['index']),
             src(mr_raw['pbrMetallicRoughness']['metallicRoughnessTexture']['index'])]
orig_tex_img = [jo['textures'][t['index']]['source'] for t in
                (jo['materials'][0]['normalTexture'], jo['materials'][0]['pbrMetallicRoughness']['baseColorTexture'],
                 jo['materials'][0]['pbrMetallicRoughness']['metallicRoughnessTexture'])]
assert orig_tex_img == [0, 1, 2], orig_tex_img
def raw_image(i):
    bv = jr['bufferViews'][jr['images'][i]['bufferView']]
    return br[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']], jr['images'][i]['mimeType']
new_imgs = [raw_image(i) for i in img_order]

# ---- skeleton: finger bones onto the chains fitted to the raw hands (Y along the bone, Z = hand Z, like the ORIG bones)
nodes = jo['nodes']; par = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []): par[c] = i
def loc_m(n):
    t = np.array(n.get('translation', [0, 0, 0]), float); x, y, z, w = n.get('rotation', [0, 0, 0, 1]); sc = np.array(n.get('scale', [1, 1, 1]), float)
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * sc; M[:3, 3] = t; return M
def quat(R):
    t = np.trace(R)
    if t > 0: S = np.sqrt(t + 1) * 2; q = [(R[2,1]-R[1,2])/S, (R[0,2]-R[2,0])/S, (R[1,0]-R[0,1])/S, 0.25*S]
    elif R[0,0] > R[1,1] and R[0,0] > R[2,2]: S = np.sqrt(1+R[0,0]-R[1,1]-R[2,2])*2; q = [0.25*S, (R[0,1]+R[1,0])/S, (R[0,2]+R[2,0])/S, (R[2,1]-R[1,2])/S]
    elif R[1,1] > R[2,2]: S = np.sqrt(1+R[1,1]-R[0,0]-R[2,2])*2; q = [(R[0,1]+R[1,0])/S, 0.25*S, (R[1,2]+R[2,1])/S, (R[0,2]-R[2,0])/S]
    else: S = np.sqrt(1+R[2,2]-R[0,0]-R[1,1])*2; q = [(R[0,2]+R[2,0])/S, (R[1,2]+R[2,1])/S, 0.25*S, (R[1,0]-R[0,1])/S]
    q = np.array(q); return (q / np.linalg.norm(q)).tolist()
_wc = {}
def world0(i):
    if i not in _wc: _wc[i] = (world0(par[i]) @ loc_m(nodes[i])) if i in par else loc_m(nodes[i])
    return _wc[i]
name2i = {n['name']: i for i, n in enumerate(nodes)}
bl2gl = lambda p: np.array([p[0], p[2], -p[1]], float)
CH = {}
for sd in ('Right', 'Left'): CH.update(json.load(open(f'{ddir}/chains3_{sd}.json')))
new_world = {}
FINGERS = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')
moved = []
for sd in ('Right', 'Left'):
    pre = f'mixamorig:{sd}Hand'; Zref = world0(name2i[pre])[:3, 2]; Zref = Zref / np.linalg.norm(Zref)
    for f in FINGERS:
        order = ([f'{pre}{f}0'] if f in ('Ring', 'Pinky') else []) + [f'{pre}{f}{i}' for i in (1, 2, 3, 4)]
        head = {b: (bl2gl(CH[b]) if b in CH else world0(name2i[b])[:3, 3]) for b in order}
        lastY = None
        for k, b in enumerate(order):
            if k + 1 < len(order): d = head[order[k + 1]] - head[b]; lastY = d / np.linalg.norm(d)
            Y = lastY; Z = Zref - (Zref @ Y) * Y; Z /= np.linalg.norm(Z); X = np.cross(Y, Z)
            Wm = np.eye(4); Wm[:3, 0], Wm[:3, 1], Wm[:3, 2], Wm[:3, 3] = X, Y, Z, head[b]
            new_world[name2i[b]] = Wm; moved.append(name2i[b])
    # selftest of the rule on the ORIGINAL joints: how far is the rule from the real ORIG rotations?
def worldN(i): return new_world.get(i, world0(i))
for i in moved:
    L = np.linalg.inv(worldN(par[i])) @ new_world[i]
    nodes[i]['translation'] = L[:3, 3].tolist(); nodes[i]['rotation'] = quat(L[:3, :3]); nodes[i]['scale'] = [1, 1, 1]; nodes[i].pop('matrix', None)
ibm_acc = jo['skins'][0]['inverseBindMatrices']; joints = jo['skins'][0]['joints']
ibm_new = acc(jo, bo, ibm_acc).reshape(-1, 4, 4).copy()
for ji, k in enumerate(joints):
    if k in new_world: ibm_new[ji] = np.linalg.inv(new_world[k]).T.astype(np.float32)
print('moved', len(moved), 'bones; max joint shift vs ORIG %.1f mm' % (1000 * max(np.linalg.norm(new_world[i][:3, 3] - world0(i)[:3, 3]) for i in moved)))

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
ia_ = jo['accessors'][jo['skins'][0]['inverseBindMatrices']]; bv_ = views[ia_['bufferView']]
o_ = bv_['byteOffset'] + ia_.get('byteOffset', 0); out[o_:o_ + ibm_new.nbytes] = np.ascontiguousarray(ibm_new, dtype=np.float32).tobytes()
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
