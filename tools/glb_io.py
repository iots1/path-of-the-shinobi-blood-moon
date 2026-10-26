"""Tiny GLB reader shared by the hand-refinement tools: accessors, node world matrices (bind pose), skin joint names."""
import json, struct
import numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(p):
    b = open(p, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L]); o = 20 + L; bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, b[o + 8:o + 8 + bl]

def acc(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = CT[a['componentType']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    r = np.frombuffer(bin_, dt, a['count'] * n, off)
    return r.reshape(a['count'], n) if n > 1 else r

def node_world(j):
    """world 4x4 of every node (rest TRS), parents resolved"""
    from math import sqrt
    N = j['nodes']; par = {}
    for i, n in enumerate(N):
        for c in n.get('children', []): par[c] = i
    def local(n):
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
        x, y, z, w = q
        R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t; return M
    W = {}
    def w(i):
        if i not in W: W[i] = (w(par[i]) if i in par else np.eye(4)) @ local(N[i])
        return W[i]
    return [w(i) for i in range(len(N))]
