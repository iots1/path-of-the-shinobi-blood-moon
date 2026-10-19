import bpy, numpy as np
from mathutils import Vector
exec(open("/private/tmp/claude-502/-Users-PEEPO-Project-game-path-of-the-shinobi-blood-moon/767458a1-02b0-4a2d-b21d-e1f58763a14f/scratchpad/hand_geo_left.py").read())

FING = {  # tip vertex ids (welded reps), finger length used to place MCP (reused from the right hand's
          # anatomical lengths, since both hands should be a similar size), geodesic tip distance = the
          # ACTUAL Dijkstra dist[r] of the tip vertex (NOT the straight-line wrist-to-tip distance — using
          # the straight-line distance here first, by mistake, made every s-bin sample vertices almost AT
          # the tip instead of partway down the finger; always read td from the hand_geo_left.py printout).
    'Index':  dict(tips=[4966], L=.070, td=.162),
    'Middle': dict(tips=[4945], L=.070, td=.161),
    'Ring':   dict(tips=[4907], L=.065, td=.151),
    'Pinky':  dict(tips=[1006], L=.055, td=.114),
    'Thumb':  dict(tips=[4675], L=.075, td=.081),
}
RATIOS = (0.28, 0.60, 1.0)   # DIP, PIP, MCP measured from the tip (fraction of L) — same as the right hand

tipname = {}
for f, d in FING.items():
    for t in d['tips']:
        tipname[t] = f
order = sorted(pos, key=lambda r: -dist[r])
label = {}
for r in order:
    if r in tipname:
        label[r] = tipname[r]; continue
    votes = {}
    for w in adj[r]:
        if dist[w] > dist[r] and label.get(w):
            votes[label[w]] = votes.get(label[w], 0) + 1
    label[r] = max(votes, key=votes.get) if votes else None

def centerline(f):
    d = FING[f]; td = d['td']
    tip = np.mean([pos[t] for t in d['tips']], 0)
    rs = [r for r in label if label[r] == f]
    pts = [(0.0, tip)]
    for k in range(0, 12):
        lo, hi = k * .01, (k + 1) * .01
        sel = np.array([pos[r] for r in rs if td - hi <= dist[r] < td - lo])
        if len(sel) >= 3:
            pts.append(((lo + hi) / 2, sel.mean(0)))
    S = np.array([p[0] for p in pts]); C = np.array([p[1] for p in pts])
    Cs = C.copy()
    for i in range(1, len(C) - 1):
        Cs[i] = .25 * C[i - 1] + .5 * C[i] + .25 * C[i + 1]
    def c(s):
        if s <= S[-1]:
            return np.array([np.interp(s, S, Cs[:, j]) for j in range(3)])
        v = (Cs[-1] - Cs[-3]) / (S[-1] - S[-3])
        return Cs[-1] + v * (s - S[-1])
    return c, tip

JOINTS = {}
for f, d in FING.items():
    c, tip = centerline(f)
    L = d['L']
    J = {'tip': tip, 'DIP': c(RATIOS[0] * L), 'PIP': c(RATIOS[1] * L), 'MCP': c(RATIOS[2] * L)}
    J['nub'] = tip + (tip - J['DIP']) * 0.35
    JOINTS[f] = J

for f, J in JOINTS.items():
    seg = [np.linalg.norm(J[a] - J[b]) for a, b in (('MCP', 'PIP'), ('PIP', 'DIP'), ('DIP', 'tip'))]
    print(f, {k: v.round(3).tolist() for k, v in J.items()})
    print(f, 'phalanx lengths (cm):', [round(x * 100, 1) for x in seg])
