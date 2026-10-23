"""Thin the palm and lengthen the fingers of the raw hands (run inside Blender with exec / import).

Why: the raw Meshy hand is mitten-like (palm 4.9–6.4 cm thick incl. the glove cuff, short fingers). A hilt held the way the reference sheet
shows (knuckles right above it, fingers crossing in front) passes through that palm. See docs/notes/hires-raw-rig-2026-10-22.md.
Always recomputed from the untouched raw (`RR_Hi`) into `RR_Raw`, so the strengths can be tuned repeatedly.

  thin_raw_hands.apply(DIR, DIRB, thin=.72, k=1.15, y0=.5, y1=3.5, y2=8.5, y3=10.5)
DIR  : chains3_<side>.json (undeformed finger joints), hand_frames.json (hand-local axes in Blender coords)
DIRB : output dir — chains3_<side>.json (deformed joints; the name the graft script expects) + a copy of bones_<side>.json
Palm: hand-local x (dorsal normal) is multiplied by s(y) = 1-(1-thin)*smoothstep(y0,y1,y)*(1-smoothstep(y2,y3,y)) (y along the hand, cm),
weighted by the vertex's hand-family weight share. Fingers: every vertex is moved along its finger's direction (MCP -> tip) by (k-1)*arc, weighted
by that finger's skin weight (so the finger thickness is untouched); the joints scale about the MCP by the same k."""
import bpy, json, shutil, os, numpy as np

ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
FING = ['Index', 'Middle', 'Ring', 'Pinky']

def apply(DIR, DIRB, thin=.72, k=1.15, y0=.5, y1=3.5, y2=8.5, y3=10.5):
    os.makedirs(DIRB, exist_ok=True)
    hi, raw = bpy.data.objects['RR_Hi'], bpy.data.objects['RR_Raw']
    names = [g.name for g in raw.vertex_groups]; gi = {n: i for i, n in enumerate(names)}; n = len(raw.data.vertices)
    P0 = np.empty(n * 3, np.float32); hi.data.vertices.foreach_get('co', P0); P0 = P0.reshape(-1, 3).astype(np.float64)
    W = np.zeros((n, len(names)), np.float32)
    for v in raw.data.vertices:
        for g in v.groups: W[v.index, g.group] = g.weight
    frames = json.load(open(f'{DIR}/hand_frames.json'))
    P = P0.copy()
    report = {}
    for side in ('Right', 'Left'):
        pre = f'mixamorig:{side}Hand'; fr = frames[side]
        o = np.array(fr['origin']); Mx = np.stack([fr['X'], fr['Y'], fr['Z']], 1)   # columns = local axes (Blender coords)
        fam = [gi[pre]] + [gi[f'{pre}{f}{i}'] for f in FING + ['Thumb'] for i in (1, 2, 3)] + [gi[f'{pre}{f}0'] for f in ('Ring', 'Pinky')]
        h = np.clip(W[:, fam].sum(1), 0, 1)
        side_mask = (np.sign(P0[:, 0]) == (1 if side == 'Left' else -1)) & (np.abs(P0[:, 0]) > 0.45)
        sel = side_mask & (h > 0.02)
        L = (P0[sel] - o) @ Mx                                  # hand-local metres
        ycm = L[:, 1] * 100
        s = 1 - (1 - thin) * ss(y0, y1, ycm) * (1 - ss(y2, y3, ycm))
        wgt = h[sel]
        L2 = L.copy(); L2[:, 0] = L[:, 0] * (1 - wgt * (1 - s))
        P[sel] = o + L2 @ Mx.T
        # joints: same thinning, then scale the fingers about their MCP
        ch = json.load(open(f'{DIR}/chains3_{side}.json')); out = dict(ch)
        def T(p):
            l = (np.array(p) - o) @ Mx; yc = l[1] * 100
            sc = 1 - (1 - thin) * ss(y0, y1, np.array([yc]))[0] * (1 - ss(y2, y3, np.array([yc]))[0]); l[0] *= sc
            return o + Mx @ l
        for f in FING + ['Thumb']:
            J = [T(ch[f'{pre}{f}{i}']) for i in (1, 2, 3, 4)]
            if f in FING:
                M = J[0]; J = [M] + [M + k * (j - M) for j in J[1:]]
                d = J[3] - M; d /= np.linalg.norm(d)
                fw = W[:, [gi[f'{pre}{f}{i}'] for i in (1, 2, 3)]].sum(1)
                arc = (P - M) @ d
                m = side_mask & (fw > 0.01)
                P[m] += np.outer((k - 1) * np.clip(arc[m], 0, None) * fw[m] * ss(0, 0.02, arc[m]), d)
            for i in (1, 2, 3, 4): out[f'{pre}{f}{i}'] = J[i - 1].tolist()
        json.dump(out, open(f'{DIRB}/chains3_{side}.json', 'w'))
        shutil.copy(f'{DIR}/bones_{side}.json', f'{DIRB}/bones_{side}.json')
        report[side] = {'moved': int(sel.sum()), 'max_palm_shift_mm': float(np.abs((P - P0)[sel]).max() * 1000)}
    raw.data.vertices.foreach_set('co', P.astype(np.float32).ravel()); raw.data.update()
    report['max_move_mm'] = float(np.linalg.norm(P - P0, axis=1).max() * 1000)
    return report
