"""Put the mesh of NEW.glb (Blender export of the edited body) into ORIG.glb, keeping everything else
(skin, animations, images, materials, nodes) byte-for-byte.
usage: python3 splice.py ORIG.glb NEW.glb OUT.glb
Outside the face zone, vertices that match an original vertex (position+uv) get the ORIGINAL normal/tangent
back, so the rest of the body shades exactly as before."""
import json, struct, sys
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(p):
    b = open(p, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L])
    o = 20 + L
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, b[o + 8:o + 8 + bl]

def acc(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = CT[a['componentType']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    assert bv.get('byteStride') in (None, n * np.dtype(dt).itemsize)
    return np.frombuffer(bin_, dt, a['count'] * n, off).reshape(a['count'], n) if n > 1 else \
        np.frombuffer(bin_, dt, a['count'], off)

orig_p, new_p, out_p = sys.argv[1:4]
jo, bo = load(orig_p)
jn, bn = load(new_p)
po = jo['meshes'][0]['primitives'][0]
pn = jn['meshes'][0]['primitives'][0]
assert len(jo['meshes']) == 1 and len(jo['meshes'][0]['primitives']) == 1

# joint remap: new skin joint index -> orig skin joint index (by node name)
jn_names = [jn['nodes'][k]['name'] for k in jn['skins'][0]['joints']]
jo_names = [jo['nodes'][k]['name'] for k in jo['skins'][0]['joints']]
assert sorted(jn_names) == sorted(jo_names), 'joint sets differ'
remap = np.array([jo_names.index(n) for n in jn_names])

A = {k: acc(jn, bn, i).copy() for k, i in pn['attributes'].items()}
idx = acc(jn, bn, pn['indices']).copy()
O = {k: acc(jo, bo, i) for k, i in po['attributes'].items()}
for k in set(O) - set(A):   # attributes the Blender export can't carry (e.g. _OUTLINE_NORMAL): new verts get NORMAL;
    print('note: new mesh lacks', k, '- filled from NORMAL for appended verts (re-run add_outline_normals.py)')
    A[k] = A['NORMAL'].astype(O[k].dtype).copy()
assert set(A) == set(O), (A.keys(), O.keys())
A['JOINTS_0'] = remap[A['JOINTS_0'].astype(int)].astype(O['JOINTS_0'].dtype)

# Keep the ORIGINAL vertex buffer and triangles verbatim; only triangles that don't exist in the original
# (the re-sculpted face) are added, using original verts where position+uv match (best normal) and
# appending new verts otherwise.  Original triangles missing from the new mesh are dropped.
oidx = acc(jo, bo, po['indices']).astype(np.int64).reshape(-1, 3)
nidx = idx.astype(np.int64).reshape(-1, 3)
P, UV, NN = A['POSITION'], A['TEXCOORD_0'], A['NORMAL']
posid = {}
opid = np.array([posid.setdefault(tuple(p), len(posid)) for p in O['POSITION'].tolist()])
CELL = 2e-5
grid = {}
for i, p in enumerate(O['POSITION']):
    grid.setdefault(tuple(np.floor(p / CELL).astype(int)), []).append(i)
OFF = [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)]
def cands(p):
    c = np.floor(p / CELL).astype(int)
    return [k for o in OFF for k in grid.get((c[0] + o[0], c[1] + o[1], c[2] + o[2]), ())
            if np.abs(O['POSITION'][k] - p).max() <= CELL]
npid = np.empty(len(P), np.int64); vmatch = np.full(len(P), -1)
for i in range(len(P)):
    cs = cands(P[i])
    if not cs: npid[i] = -1 - i; continue
    npid[i] = opid[cs[0]]
    cs = [k for k in cs if np.abs(O['TEXCOORD_0'][k] - UV[i]).max() < 2e-4]
    if cs: vmatch[i] = max(cs, key=lambda k: float(np.dot(O['NORMAL'][k], NN[i])))
ouv = np.round(O['TEXCOORD_0'] * 4096).astype(np.int64); nuv = np.round(UV * 4096).astype(np.int64)
okey = lambda t: frozenset((int(opid[i]), int(ouv[i, 0]), int(ouv[i, 1])) for i in t)
nkey = lambda t: frozenset((int(npid[i]), int(nuv[i, 0]), int(nuv[i, 1])) for i in t)
okeys = set(okey(t) for t in oidx)
nkeys = set(nkey(t) for t in nidx)
keep = np.array([okey(t) in nkeys for t in oidx])
add = np.array([nkey(t) not in okeys for t in nidx])
newv = {}
def vid(i):
    if vmatch[i] >= 0: return int(vmatch[i])
    if i not in newv: newv[i] = len(O['POSITION']) + len(newv)
    return newv[i]
addt = np.array([[vid(i) for i in t] for t in nidx[add]], np.int64).reshape(-1, 3)
order = sorted(newv, key=newv.get)
A = {k: np.concatenate([O[k], A[k][order].astype(O[k].dtype)]) for k in O}
idx = np.concatenate([oidx[keep], addt]).ravel()
cp = P[order]
print(f'orig verts {len(O["POSITION"])} + new {len(order)}; tris kept {keep.sum()}/{len(oidx)}, added {add.sum()}',
      'new-vert bbox', cp.min(0).round(3).tolist() if len(cp) else None, cp.max(0).round(3).tolist() if len(cp) else None)
# drop vertices no triangle uses any more (the original face verts that were replaced)
used = np.zeros(len(A['POSITION']), bool); used[idx] = True
newi = np.cumsum(used) - 1
A = {k: v[used] for k, v in A.items()}; idx = newi[idx]
print('dropped unreferenced verts', int((~used).sum()))
P = A['POSITION']
ws = A['WEIGHTS_0'].sum(1); print('weight sum min/max', ws.min(), ws.max())

# rebuild the binary: old mesh bufferViews dropped, everything else copied, new mesh data appended
old_views = set(jo['accessors'][i]['bufferView'] for i in list(po['attributes'].values()) + [po['indices']])
used_elsewhere = set()
for ai, a in enumerate(jo['accessors']):
    if ai not in list(po['attributes'].values()) + [po['indices']]: used_elsewhere.add(a['bufferView'])
for im in jo['images']: used_elsewhere.add(im['bufferView'])
assert not (old_views & used_elsewhere)
out = bytearray(); views = []; vmap = {}
def pad():
    while len(out) % 4: out.append(0)
for vi, bv in enumerate(jo['bufferViews']):
    if vi in old_views: continue
    pad(); s = bv.get('byteOffset', 0)
    nb = dict(bv); nb['byteOffset'] = len(out); out.extend(bo[s:s + bv['byteLength']])
    vmap[vi] = len(views); views.append(nb)
for a in jo['accessors']:
    if a.get('bufferView') in vmap: a['bufferView'] = vmap[a['bufferView']]
for im in jo['images']: im['bufferView'] = vmap[im['bufferView']]

def put(arr, target):
    pad(); arr = np.ascontiguousarray(arr)
    v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': arr.nbytes}
    if target: v['target'] = target
    out.extend(arr.tobytes()); views.append(v); return len(views) - 1

RT = {np.dtype(v): k for k, v in CT.items()}
for k, ai in po['attributes'].items():
    arr = A[k].astype(O[k].dtype) if k != 'JOINTS_0' else A[k]
    a = jo['accessors'][ai]
    a['bufferView'] = put(arr, 34962); a['count'] = len(arr); a.pop('byteOffset', None)
    a['componentType'] = RT[arr.dtype]
    if k == 'POSITION': a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
ia = jo['accessors'][po['indices']]
idx = idx.astype(np.uint16 if len(P) < 65535 else np.uint32)
ia['bufferView'] = put(idx, 34963); ia['count'] = len(idx); ia['componentType'] = RT[idx.dtype]; ia.pop('byteOffset', None)
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
print('wrote', out_p, total)
