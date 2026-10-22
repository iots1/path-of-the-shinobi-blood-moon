"""Add `_OUTLINE_NORMAL` to the body primitive: one normal per POSITION (all UV-seam / hard-edge copies of a vertex
share it), angle-weighted over every face that touches any copy.  The game's inverted-hull outline extrudes along
this instead of NORMAL, so the hull no longer tears into black flaps where the glb splits a vertex.
Run it LAST on any new glb (Blender exports drop custom attributes).  Re-running replaces the attribute.
usage: python3 add_outline_normals.py IN.glb OUT.glb"""
import sys, json, struct
import numpy as np
exec(open(__file__.replace('add_outline_normals.py', 'splice.py')).read().split("orig_p, new_p")[0])

src, dst = sys.argv[1:3]
j, b = load(src)
pr = j['meshes'][0]['primitives'][0]
pr['attributes'].pop('_OUTLINE_NORMAL', None)
P = acc(j, b, pr['attributes']['POSITION']).astype(np.float64)
N = acc(j, b, pr['attributes']['NORMAL']).astype(np.float64)
T = acc(j, b, pr['indices']).astype(np.int64).reshape(-1, 3)

_, pid = np.unique(np.round(P, 6), axis=0, return_inverse=True)     # same position
pid = pid.ravel()
# Meshy's double-layered cloth has copies at one position facing opposite ways: only weld copies on the same side
# (normal within 90 deg of the first copy's), or the averaged normal collapses to noise
first = np.full(pid.max() + 1, -1);
for i in range(len(P)):
    if first[pid[i]] < 0: first[pid[i]] = i
side = ((N * N[first[pid]]).sum(1) >= 0).astype(np.int64)
_, wid = np.unique(pid * 2 + side, return_inverse=True)
wid = wid.ravel()
a, bb, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
fn = np.cross(bb - a, c - a); fl = np.linalg.norm(fn, axis=1); ok = fl > 1e-14
fn[ok] /= fl[ok, None]
def ang(p, q, r):
    u, v = q - p, r - p
    cu = (u * v).sum(1) / np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-14)
    return np.arccos(np.clip(cu, -1, 1))
W = np.stack([ang(a, bb, c), ang(bb, c, a), ang(c, a, bb)], 1) * ok[:, None]
acc_n = np.zeros((wid.max() + 1, 3))
for k in range(3):   # inward-wound faces (Meshy double layers): flip each face to agree with the corner's own normal
    sg = np.where((fn * N[T[:, k]]).sum(1) < 0, -1.0, 1.0)[:, None]
    np.add.at(acc_n, wid[T[:, k]], fn * sg * W[:, k:k + 1])
L = np.linalg.norm(acc_n, axis=1); good = L > 1e-12
acc_n[good] /= L[good, None]
ON = acc_n[wid]
bad = ~good[wid]; ON[bad] = N[bad]                                   # isolated/degenerate: keep the original
dev = np.degrees(np.arccos(np.clip((ON * N).sum(1), -1, 1)))
print(f'verts {len(P)}, welded positions {wid.max() + 1}, normal change p50 {np.percentile(dev, 50):.1f} p99 {np.percentile(dev, 99):.1f} max {dev.max():.1f} deg')
ON = ON.astype(np.float32)

out = bytearray(b)
while len(out) % 4: out.append(0)
j['bufferViews'].append({'buffer': 0, 'byteOffset': len(out), 'byteLength': ON.nbytes, 'target': 34962})
out.extend(ON.tobytes())
j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': len(ON), 'type': 'VEC3'})
pr['attributes']['_OUTLINE_NORMAL'] = len(j['accessors']) - 1
j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(out), b'BIN\x00')); f.write(out)
print('wrote', dst)
