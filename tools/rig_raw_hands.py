"""Rig the finger chains of the raw Meshy hands inside Blender (run with exec() from the blender-mcp `execute_blender_code`).

Inputs (JSON, written by the analysis scripts, Blender coordinates): chains3_<Right|Left>.json = {bone: head xyz} for
Index/Middle/Ring/Pinky/Thumb 1..4 (4 = fingertip joint, ~8 mm inside the tip); bones_<side>.json = the old rig (for Ring0/Pinky0).
Objects: RR_Hi (raw, transferred body weights), RR_Armature (old rig), RR_Raw (copy of RR_Hi that receives the new weights),
RR_Armature2 (copy of the rig whose finger bones are moved).
  rig_raw_hands.apply(DIR)  -> moves the finger bones, recomputes the hand-family weights and smooths them.
Weights: hand-family share h = old (transferred) weight on Hand/finger/metacarpal bones; the finger owner of a vertex = surface
(geodesic) nearest finger chain — labels flooded over the welded mesh from the surface within ~radius of each chain, so touching
fingers do not steal each other's skin; finger weight = fade(distance to its chain) * ramp(past the MCP); bone split along the
chain by smoothsteps around PIP/DIP; rest -> Hand (+ Ring0/Pinky0 metacarpals by distance to their line); then a 4 mm
neighbourhood smoothing (3 passes) so neighbouring vertices never get unrelated bones; top-4 influences, normalised.
"""
import bpy, bmesh, json, numpy as np, heapq, math
from mathutils import Vector
from mathutils.kdtree import KDTree

FING = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']
ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))

def _seg(Q, A, B):
    ab = B - A; L2 = ab @ ab; t = ((Q - A) @ ab) / L2; tc = np.clip(t, 0, 1)
    return np.linalg.norm(Q - (A + tc[:, None] * ab), axis=1), t * np.sqrt(L2), np.sqrt(L2)

def _chain(Q, J):
    best = np.full(len(Q), 9.0); arc = np.zeros(len(Q)); off = 0.0
    d4 = J[3] - J[2]; d4 /= np.linalg.norm(d4)
    segs = [(J[0], J[1]), (J[1], J[2]), (J[2], J[3]), (J[3], J[3] + d4 * 0.010)]
    for si, (A, B) in enumerate(segs):
        d, a, L = _seg(Q, A, B)
        a_use = a if si == 0 else off + np.clip(a, 0, L)
        m = d < best; best[m] = d[m]; arc[m] = a_use[m]; off += L
    return best, arc

def move_bones(DIR, arm_name='RR_Armature2'):
    a2 = bpy.data.objects[arm_name]
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = a2; a2.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); eb = a2.data.edit_bones
    for side in ('Right', 'Left'):
        pre = f'mixamorig:{side}Hand'; ch = json.load(open(f'{DIR}/chains3_{side}.json'))
        hz = Vector(eb[pre].matrix.to_3x3().col[2])
        for f in FING:
            heads = [Vector(ch[f'{pre}{f}{i}']) for i in (1, 2, 3, 4)]
            for i in range(4):
                b = eb[f'{pre}{f}{i+1}']; b.head = heads[i]
                b.tail = heads[i + 1] if i < 3 else heads[3] + (heads[3] - heads[2]).normalized() * 0.012
            for i in range(4): eb[f'{pre}{f}{i+1}'].align_roll(hz)
        for f in ('Ring', 'Pinky'):
            b = eb[f'{pre}{f}0']; b.tail = eb[f'{pre}{f}1'].head; b.align_roll(hz); eb[f'{pre}{f}1'].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in a2.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    a2.data.pose_position = 'POSE'

def weights(DIR, hi_name='RR_Hi', raw_name='RR_Raw'):
    hi = bpy.data.objects[hi_name]; raw = bpy.data.objects[raw_name]
    names = [g.name for g in hi.vertex_groups]; gi = {n: i for i, n in enumerate(names)}; n = len(hi.data.vertices)
    P = np.empty(n * 3, np.float32); hi.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3).astype(np.float64)
    W0 = np.zeros((n, len(names)), np.float32)
    for v in hi.data.vertices:
        for g in v.groups: W0[v.index, g.group] = g.weight
    E = np.empty(len(hi.data.edges) * 2, np.int32); hi.data.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    W = W0.copy()
    for side in ('Right', 'Left'):
        pre = f'mixamorig:{side}Hand'; ch = json.load(open(f'{DIR}/chains3_{side}.json')); B = json.load(open(f'{DIR}/bones_{side}.json'))
        J = {f: np.array([ch[f'{pre}{f}{i}'] for i in (1, 2, 3, 4)]) for f in FING}
        fam = [pre] + [f'{pre}{f}{i}' for f in ('Index', 'Middle') for i in (1, 2, 3)] + [f'{pre}{f}{i}' for f in ('Ring', 'Pinky') for i in (0, 1, 2, 3)] + [f'{pre}Thumb{i}' for i in (1, 2, 3)]
        idx_fam = [gi[b] for b in fam]; h = W0[:, idx_fam].sum(1); reg = np.flatnonzero(h > 0.001); Q = P[reg]
        _, uid, inv = np.unique(np.round(Q / 1e-5).astype(np.int64), axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
        U = Q[uid]; nu = len(U); pos = {int(r): i for i, r in enumerate(reg)}
        inreg = np.zeros(n, bool); inreg[reg] = True; m = inreg[E[:, 0]] & inreg[E[:, 1]]
        adj = [[] for _ in range(nu)]
        for x, y in zip(E[m, 0], E[m, 1]):
            a, b = inv[pos[int(x)]], inv[pos[int(y)]]
            if a != b:
                L = float(np.linalg.norm(U[a] - U[b])); adj[a].append((b, L)); adj[b].append((a, L))
        Dc = np.zeros((nu, 5)); Ac = np.zeros((nu, 5))
        for fi, f in enumerate(FING): Dc[:, fi], Ac[:, fi] = _chain(U, J[f])
        best = np.full(nu, 9.0); lab = -np.ones(nu, int); heap = []
        rad = np.array([0.0105, 0.0105, 0.0105, 0.0095, 0.0125])
        for fi in range(5):
            for u in np.flatnonzero(Dc[:, fi] < rad[fi]):
                c = Dc[u, fi]
                if c < best[u]: best[u] = c; lab[u] = fi; heapq.heappush(heap, (c, int(u), fi))
        while heap:
            c, u, f = heapq.heappop(heap)
            if c > best[u] + 1e-12 or lab[u] != f: continue
            for v, L in adj[u]:
                if c + L < best[v]: best[v] = c + L; lab[v] = f; heapq.heappush(heap, (c + L, v, f))
        own_u = np.where(lab >= 0, lab, Dc.argmin(1)); own = own_u[inv]
        dsel = Dc[np.arange(nu), own_u][inv]; asel = Ac[np.arange(nu), own_u][inv]
        scale = np.array([1.0, 1.0, 1.0, 1.0, 1.35])[own]
        wown = 1 - ss(0.0125 * scale, 0.019 * scale, dsel)
        q = np.where(own == 4, ss(0.0, 0.020, asel), ss(0.000, 0.024, asel)); Fw = wown * q
        newW = np.zeros((len(reg), len(names)), np.float32)
        for fi, f in enumerate(FING):
            mk = own == fi
            if not mk.any(): continue
            Jf = J[f]; s1 = np.linalg.norm(Jf[1] - Jf[0]); s2 = s1 + np.linalg.norm(Jf[2] - Jf[1]); a = asel[mk]
            b1 = 1 - ss(s1 - 0.006, s1 + 0.006, a); b3 = ss(s2 - 0.005, s2 + 0.005, a); b2 = np.clip(1 - b1 - b3, 0, 1)
            for k, b in zip((1, 2, 3), (b1, b2, b3)): newW[np.flatnonzero(mk), gi[f'{pre}{f}{k}']] += (Fw[mk] * b).astype(np.float32)
        rest = 1 - Fw; mc = np.zeros(len(reg))
        for f in ('Ring', 'Pinky'):
            A0 = np.array(B[f'{pre}{f}0']['head']); d, a, L = _seg(Q, A0, J[f][0]); t = a / L
            mw = np.minimum((1 - ss(0.011, 0.018, d)) * ss(0.10, 0.55, t) * (t < 1.15), 0.9)
            newW[:, gi[f'{pre}{f}0']] = (rest * mw).astype(np.float32); mc += rest * mw
        newW[:, gi[pre]] = (rest - mc).astype(np.float32)
        nonfam = W0[reg].copy(); nonfam[:, idx_fam] = 0
        W[reg] = nonfam + h[reg][:, None] * newW
    # smoothing over a 4 mm neighbourhood (touching fingers must not get unrelated bones on adjacent vertices)
    fam_all = [i for i, nm in enumerate(names) if 'Hand' in nm and nm.split('Hand')[-1] != '' or nm.endswith('RightHand') or nm.endswith('LeftHand')]
    hh = W[:, fam_all].sum(1); reg = np.flatnonzero(hh > 0.01)
    kd = KDTree(len(reg))
    for i, r in enumerate(reg): kd.insert(P[r], i)
    kd.balance()
    nbr = [[j for (_, j, _) in kd.find_range(P[r], 0.004)] for r in reg]
    Wr = W[reg].copy()
    for _ in range(3):
        New = np.empty_like(Wr)
        for i, js in enumerate(nbr): New[i] = Wr[js].mean(0)
        Wr = 0.4 * Wr + 0.6 * New
    W[reg] = Wr
    order = np.argsort(-W, axis=1)[:, :4]; rows = np.arange(n)[:, None]
    out = np.zeros_like(W); out[rows, order] = W[rows, order]; out /= out.sum(1, keepdims=True)
    bm = bmesh.new(); bm.from_mesh(raw.data); dl = bm.verts.layers.deform.verify(); bm.verts.ensure_lookup_table()
    for vi in range(n): bm.verts[vi][dl].clear()
    for vi, gj in zip(*np.nonzero(out > 1e-4)): bm.verts[int(vi)][dl][int(gj)] = float(out[vi, gj])
    bm.to_mesh(raw.data); bm.free(); raw.data.update()
    np.save(f'{DIR}/raw_weights_final.npy', out)
    return out

def apply(DIR):
    move_bones(DIR); return weights(DIR)
