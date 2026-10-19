import bpy, numpy as np, json, os
exec(open("/private/tmp/claude-502/-Users-PEEPO-Project-game-path-of-the-shinobi-blood-moon/767458a1-02b0-4a2d-b21d-e1f58763a14f/scratchpad/build_fingers_left.py").read())

SCR = "/private/tmp/claude-502/-Users-PEEPO-Project-game-path-of-the-shinobi-blood-moon/767458a1-02b0-4a2d-b21d-e1f58763a14f/scratchpad/"
ORIG = SCR + "orig_weights_left_hand.json"
mesh = bpy.data.objects['Mesh0']
gname = {g.index: g.name for g in mesh.vertex_groups}

hand_vg = mesh.vertex_groups['mixamorig:LeftHand'].index
cand = [v.index for v in mesh.data.vertices if any(g.group == hand_vg and g.weight > 0.01 for g in v.groups)]

if not os.path.exists(ORIG):
    snap = {str(i): {gname[g.group]: g.weight for g in mesh.data.vertices[i].groups} for i in cand}
    json.dump(snap, open(ORIG, 'w'))
orig = json.load(open(ORIG))

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

poly = {}
for f, J in JOINTS.items():
    P = np.array([J['MCP'], J['PIP'], J['DIP'], J['tip'], J['nub']])
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    poly[f] = (P, seg, np.concatenate([[0], np.cumsum(seg)]))

D_FULL, D_ZERO = 0.0125, 0.0185
PHI0, PHI1 = -0.004, 0.012
HW_PIP, HW_DIP = 0.007, 0.006

def project(f, x):
    P, seg, cum = poly[f]
    best = (1e9, 0.0)
    for i in range(len(seg)):
        a, b = P[i], P[i + 1]; ab = b - a
        t = np.dot(x - a, ab) / (seg[i] ** 2)
        tc = np.clip(t, 0, 1)
        d = np.linalg.norm(x - (a + ab * tc))
        u = cum[i] + t * seg[i] if (i > 0 or t >= 0) else t * seg[i]
        if d < best[0]:
            best = (d, u)
    return best

new = {}
stats = {f: 0 for f in poly}
for i in cand:
    x = np.array(mesh.data.vertices[i].co)
    f_best, d_best, u_best = None, 1e9, 0
    for f in poly:
        d, u = project(f, x)
        if d < d_best:
            f_best, d_best, u_best = f, d, u
    w = dict(orig[str(i)])
    m = 1 - smooth(D_FULL, D_ZERO, d_best)
    phi = smooth(PHI0, PHI1, u_best) * m
    if f_best is not None and phi > 1e-4:
        P, seg, cum = poly[f_best]
        s1 = smooth(cum[1] - HW_PIP, cum[1] + HW_PIP, u_best)
        s2 = smooth(cum[2] - HW_DIP, cum[2] + HW_DIP, u_best)
        parts = {1: (1 - s1), 2: s1 * (1 - s2), 3: s1 * s2}
        w = {k: v * (1 - phi) for k, v in w.items()}
        for k, pw in parts.items():
            if pw * phi > 1e-4:
                w[f'mixamorig:LeftHand{f_best}{k}'] = pw * phi
        stats[f_best] += 1
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    s = sum(v for _, v in top)
    new[i] = {k: v / s for k, v in top if v / s > 1e-3}

for f in poly:
    for k in (1, 2, 3, 4):
        nm = f'mixamorig:LeftHand{f}{k}'
        if nm not in mesh.vertex_groups:
            mesh.vertex_groups.new(name=nm)
for i, w in new.items():
    for g in list(mesh.data.vertices[i].groups):
        mesh.vertex_groups[g.group].remove([i])
    for k, v in w.items():
        mesh.vertex_groups[k].add([i], v, 'REPLACE')
print("candidates", len(cand), "finger-affected per finger", stats)
