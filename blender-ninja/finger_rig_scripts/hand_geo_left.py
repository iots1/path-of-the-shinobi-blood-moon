import bpy, numpy as np, heapq

SIDE = 'Left'
BONE = f'mixamorig:{SIDE}Hand'
VG = BONE

arm = bpy.data.objects['target_character']; m = bpy.data.objects['Mesh0']
b = arm.data.bones[BONE]
head = np.array(b.head_local); a = np.array(b.tail_local) - head; a /= np.linalg.norm(a)
vg = m.vertex_groups[VG].index
V = m.data.vertices
import os, json
_ORIG = "/private/tmp/claude-502/-Users-PEEPO-Project-game-path-of-the-shinobi-blood-moon/767458a1-02b0-4a2d-b21d-e1f58763a14f/scratchpad/orig_weights_left_hand.json"
if os.path.exists(_ORIG):   # weights were already edited: select the hand by its ORIGINAL weights
    _o = json.load(open(_ORIG))
    ids = [int(i) for i, w in _o.items() if w.get(VG, 0) > 0.2]
else:
    ids = [v.index for v in V if any(g.group == vg and g.weight > 0.2 for g in v.groups)]
idset = set(ids)

key = {}
for i in ids:
    key.setdefault(tuple(np.round(np.array(V[i].co), 5)), []).append(i)
rep = {}; pos = {}; members = {}
for k, l in key.items():
    members[l[0]] = l
    for i in l:
        rep[i] = l[0]
    pos[l[0]] = np.array(V[l[0]].co)
adj = {r: {} for r in pos}
for p in m.data.polygons:
    n = len(p.vertices)
    for i in range(n):
        x, y = p.vertices[i], p.vertices[(i + 1) % n]
        if x in idset and y in idset:
            rx, ry = rep[x], rep[y]
            if rx != ry:
                d = float(np.linalg.norm(pos[rx] - pos[ry]))
                adj[rx][ry] = d; adj[ry][rx] = d

def dijkstra(sources):
    dist = {r: 1e9 for r in pos}; pq = []
    for r in sources:
        dist[r] = 0; heapq.heappush(pq, (0, r))
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for w, l in adj[u].items():
            if d + l < dist[w]:
                dist[w] = d + l; heapq.heappush(pq, (d + l, w))
    return dist

src = [r for r in pos if (pos[r] - head) @ a < 0.03]
dist = dijkstra(src)
tips = [r for r in pos if adj[r] and all(dist[w] <= dist[r] for w in adj[r]) and dist[r] < 1e8]
tips.sort(key=lambda r: -dist[r])
print('n verts', len(pos), 'n tips (raw local maxima)', len(tips))
for r in tips:
    print(r, pos[r].round(4), 'geo', round(dist[r], 3))
