import bpy, numpy as np
from mathutils import Vector
exec(open("/private/tmp/claude-502/-Users-PEEPO-Project-game-path-of-the-shinobi-blood-moon/767458a1-02b0-4a2d-b21d-e1f58763a14f/scratchpad/hand_geo.py").read())

SIDE = 'Right'
FING = {  # tip vertex ids (welded reps), length from tip to MCP, geodesic tip distance
    'Index':  dict(tips=[1178, 5365], L=.070, td=.179),
    'Middle': dict(tips=[5351],       L=.070, td=.176),
    'Ring':   dict(tips=[1154],       L=.070, td=.160),
    'Pinky':   dict(tips=[5226],      L=.055, td=.129),
    'Thumb':  dict(tips=[5202],       L=.075, td=.093),
}
RATIOS = (0.28, 0.60, 1.0)   # DIP, PIP, MCP measured from the tip (fraction of L)

# --- flow-up labelling of finger vertices
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

# --- centerline c(s): s = distance from the tip (geodesic units)
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
    # light smoothing of the interior points
    Cs = C.copy()
    for i in range(1, len(C) - 1):
        Cs[i] = .25 * C[i - 1] + .5 * C[i] + .25 * C[i + 1]
    def c(s):
        if s <= S[-1]:
            return np.array([np.interp(s, S, Cs[:, j]) for j in range(3)])
        v = (Cs[-1] - Cs[-3]) / (S[-1] - S[-3])   # extrapolate with the last slope
        return Cs[-1] + v * (s - S[-1])
    return c, tip

JOINTS = {}
for f, d in FING.items():
    c, tip = centerline(f)
    L = d['L']
    J = {'tip': tip, 'DIP': c(RATIOS[0] * L), 'PIP': c(RATIOS[1] * L), 'MCP': c(RATIOS[2] * L)}
    J['nub'] = tip + (tip - J['DIP']) * 0.35
    JOINTS[f] = J

if __name__ == '__main__' or True:
    for f, J in JOINTS.items():
        print(f, {k: v.round(3).tolist() for k, v in J.items()})
