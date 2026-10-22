"""Headless face re-sculpt for assets/ninja.glb.
usage: Blender -b --factory-startup --python face_edit.py -- IN.glb OUTPREFIX [--export OUT_mesh.glb] [--nosculpt] [--norefine]
Only vertex POSITIONS are sculpted; UVs and skin weights are carried (interpolated on new verts)."""
import bpy, bmesh, sys, math, json
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
EXPORT = argv[argv.index('--export') + 1] if '--export' in argv else None
SCULPT = '--nosculpt' not in argv
REFINE = '--norefine' not in argv
FEAT = json.load(open(argv[argv.index('--feat') + 1])) if '--feat' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
body = next(o for o in sc.objects if o.type == 'MESH')
if arm.animation_data: arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
me = body.data
vg = {g.name: g.index for g in body.vertex_groups}
HEAD, NECK = vg['mixamorig:Head'], vg['mixamorig:Neck']
log = {}

def ss(e0, e1, x):  # smoothstep
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

RAW = '--raw' in argv
bm = bmesh.new(); bm.from_mesh(me)
dl = bm.verts.layers.deform.active
uvl = bm.loops.layers.uv.active
nv0, nf0 = len(bm.verts), len(bm.faces)

def headish(v):
    d = v[dl]
    return (d.get(HEAD, 0) + d.get(NECK, 0)) > 0.3 and v.co.z > 1.40

if not RAW:
    # 1) weld the UV-seam duplicates on the head/neck so normals are continuous
    hv = [v for v in bm.verts if headish(v)]
    r = bmesh.ops.remove_doubles(bm, verts=hv, dist=1e-5)
    log['welded'] = nv0 - len(bm.verts)
    bm.normal_update()
    if '--del-islands' in argv:   # small loose pieces on the head (Meshy shards), by connected faces
        lim = int(argv[argv.index('--del-islands') + 1]); seen = set(); kill = []
        for f in bm.faces:
            if f in seen: continue
            st = [f]; comp = []; seen.add(f)
            while st:
                g = st.pop(); comp.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h not in seen: seen.add(h); st.append(h)
            if len(comp) < lim and all(headish(v) for g in comp for v in g.verts): kill += comp
        bmesh.ops.delete(bm, geom=kill, context='FACES'); log['islands_deleted_faces'] = len(kill)
        bm.normal_update()
    from mathutils.bvhtree import BVHTree
    BVH0 = BVHTree.FromBMesh(bm)

    def core(p):   # 2.5 mm zone: eyes/nose/mouth/chin
        return abs(p.x) < 0.058 and 1.505 < p.z < 1.645 and p.y < -0.055
    def outer(p):  # 5 mm zone: the rest of the face + under the jaw
        return abs(p.x) < 0.075 and 1.48 < p.z < 1.650 and p.y < -0.0

    new_verts = set()
    from mathutils.kdtree import KDTree
    KD0 = KDTree(len(bm.verts))
    for v in bm.verts: KD0.insert(v.co, v.index)
    KD0.balance()
    def is_orig(v): return KD0.find(v.co)[2] < 1e-7

    def mkey(p): return tuple(round(c, 7) for c in p)

    def loop_level(zonefn, tag):
        """One Loop-subdivision step on the triangles inside the zone; the zone's rim stays put."""
        R = set(f for f in bm.faces if len(f.verts) == 3 and all(headish(v) for v in f.verts)
                and zonefn(f.calc_center_median()))
        ER = set(e for f in R for e in f.edges)
        epos = {}
        for e in ER:
            a, b = e.verts
            lf = list(e.link_faces)
            if len(lf) == 2 and all(f in R for f in lf):
                c = next(v for v in lf[0].verts if v not in (a, b)); d = next(v for v in lf[1].verts if v not in (a, b))
                epos[mkey((a.co + b.co) * 0.5)] = (a.co + b.co) * 0.375 + (c.co + d.co) * 0.125
            else:
                epos[mkey((a.co + b.co) * 0.5)] = (a.co + b.co) * 0.5
        vpos = {}
        for v in set(v for f in R for v in f.verts):
            if all(f in R for f in v.link_faces) and all(len(e.link_faces) == 2 for e in v.link_edges):
                nb = [e.other_vert(v).co for e in v.link_edges]; n = len(nb)
                beta = (0.625 - (0.375 + 0.25 * math.cos(2 * math.pi / n)) ** 2) / n
                vpos[mkey(v.co)] = v.co * (1 - n * beta) + sum(nb, Vector()) * beta
        bmesh.ops.subdivide_edges(bm, edges=list(ER), cuts=1, use_grid_fill=True)
        hit = 0
        for v in bm.verts:
            k = mkey(v.co)
            p = epos.get(k)
            if p is None: p = vpos.get(k)
            if p is not None: v.co = p; hit += 1
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
        bm.normal_update()
        log['loop' + tag] = (len(R), len(epos), hit, len(vpos))

    LEVELS = argv[argv.index('--levels') + 1] if '--levels' in argv else '12'
    def nosez(p):  # 1.25 mm zone: the nose
        return abs(p.x) < 0.024 and 1.561 < p.z < 1.624 and p.y < -0.088
    if REFINE:
        if '1' in LEVELS: loop_level(lambda p: core(p) or outer(p), '1')
        if '2' in LEVELS: loop_level(core, '2')
        if '3' in LEVELS: loop_level(nosez, '3')
        if '4' in LEVELS: loop_level(lambda p: abs(p.x) < 0.013 and 1.550 < p.z < 1.583 and -0.123 < p.y < -0.100, '4')
        # collapse needle triangles (min angle < 4 deg) left at the refined-zone rims: their normals
        # are garbage and render as white specks
        def minang(f):
            a = []
            for i in range(3):
                p, q, r = f.verts[i].co, f.verts[i - 1].co, f.verts[(i + 1) % 3].co
                u, v = q - p, r - p
                if u.length < 1e-9 or v.length < 1e-9: return 0
                a.append(u.angle(v))
            return math.degrees(min(a))
        nfix = 0
        for _ in range(4):
            bad = [f for f in bm.faces if len(f.verts) == 3 and all(headish(v) for v in f.verts) and f.calc_center_median().y < -0.05 and minang(f) < 4]
            if not bad: break
            done = set()
            for f in bad:
                if not f.is_valid or any(v in done for v in f.verts): continue
                e = min(f.edges, key=lambda e: e.calc_length())
                a, b = e.verts
                if a.is_boundary or b.is_boundary: continue
                done.update((a, b))
                bmesh.ops.pointmerge(bm, verts=[a, b], merge_co=(a.co + b.co) * 0.5)
                nfix += 1
            bm.normal_update()
        log['needles_collapsed'] = nfix
        # thin-plate (bi-Laplacian) fill: new verts relax, original verts stay where they were
        bm.verts.ensure_lookup_table(); bm.verts.index_update()
        zone = [v for v in bm.verts if headish(v)]
        zi = {v: i for i, v in enumerate(zone)}
        X = np.array([tuple(v.co) for v in zone])
        E = np.array([(zi[e.verts[0]], zi[e.verts[1]]) for e in bm.edges if e.verts[0] in zi and e.verts[1] in zi])
        deg = np.bincount(E.ravel(), minlength=len(zone)).astype(float)[:, None]
        free = np.array([not is_orig(v) for v in zone])
        new_verts = set(v for v, i in zi.items() if free[i])
        def lap(A):  # inverse-edge-length weighted umbrella (less bias on irregular triangles)
            w = 1.0 / np.maximum(np.linalg.norm(A[E[:, 0]] - A[E[:, 1]], axis=1), 1e-5)[:, None]
            S = np.zeros_like(A); W = np.zeros((len(A), 1))
            np.add.at(S, E[:, 0], w * A[E[:, 1]]); np.add.at(S, E[:, 1], w * A[E[:, 0]])
            np.add.at(W, E[:, 0], w); np.add.at(W, E[:, 1], w)
            return S / np.maximum(W, 1e-9) - A
        # normal-only Taubin smoothing of the whole refined zone (removes Meshy's ~1 cm surface noise
        # without sliding verts sideways, so the painted texture stays where it is)
        F3 = np.array([[zi[v] for v in f.verts] for f in bm.faces if all(v in zi for v in f.verts)])
        def vnormals(A):
            fn = np.cross(A[F3[:, 1]] - A[F3[:, 0]], A[F3[:, 2]] - A[F3[:, 0]])
            N = np.zeros_like(A)
            for k in range(3): np.add.at(N, F3[:, k], fn)
            return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        P = X
        wz = np.array([ss(0.075, 0.06, abs(p[0])) * ss(1.638, 1.625, p[2]) * ss(1.48, 1.495, p[2]) * ss(0.0, -0.015, p[1]) for p in P])
        NIT = int(argv[argv.index('--smooth') + 1]) if '--smooth' in argv else 30
        for k in range(NIT):
            for lam in (0.5, -0.53):
                N = vnormals(X)
                dn = (lap(X) * N).sum(1, keepdims=True) * N
                X += lam * dn * wz[:, None]
        for v, i in zi.items():
            v.co = X[i]
        bm.normal_update()
        log['fill_free'] = int(free.sum())
        dd = np.array([(v.co - BVH0.find_nearest(v.co)[0]).length for v in new_verts]) * 1000
        if len(dd): log['newdist_mm_p50_p95_max'] = (float(np.percentile(dd, 50)), float(np.percentile(dd, 95)), float(dd.max()))
        bad = [tuple(round(c, 3) for c in v.co) for v in new_verts if (v.co - BVH0.find_nearest(v.co)[0]).length > 0.003][:15]
        log['bad'] = bad
        flipped = 0; tiny = 0
        for f in bm.faces:
            if not any(v in new_verts for v in f.verts): continue
            if f.calc_area() < 1e-9: tiny += 1; continue
            loc, nrm, _, _ = BVH0.find_nearest(f.calc_center_median())
            if nrm.dot(f.normal) < 0:
                flipped += 1; log.setdefault('flipc', []).append(tuple(round(c*1000) for c in f.calc_center_median()))
        log['flipped'] = flipped; log['tiny'] = tiny
        badn = 0
        for v in new_verts:
            loc, nrm, _, _ = BVH0.find_nearest(v.co)
            if nrm.dot(v.normal) < 0.94: badn += 1
        log['newvert_normal_off20deg'] = badn
        nonman = sum(1 for e in bm.edges if not e.is_manifold and e.verts[0] in zi)
        log['nonmanifold_zone'] = nonman

    # 2) sculpt
    F = FEAT or []
    def feat_disp(v):
        p, n = v.co, v.normal
        d = Vector((0, 0, 0))
        for f in F:
            sides = (1, -1) if f.get('mirror', True) and f.get('x', 0) != 0 else (1,)
            for s in sides:
                cx = f.get('x', 0) * s
                dx, dz = p.x - cx, p.z - f['z']
                ang = math.radians(f.get('rot', 0)) * s
                u = dx * math.cos(ang) + dz * math.sin(ang)
                w = -dx * math.sin(ang) + dz * math.cos(ang)
                if 'y' in f:   # 3D blob
                    dy = p.y - f['y']
                    g = math.exp(-0.5 * ((u / f['sx']) ** 2 + (w / f['sz']) ** 2 + (dy / f['sy']) ** 2))
                else:          # front-projected blob, gated to the front of the face
                    g = math.exp(-0.5 * ((u / f['sx']) ** 2 + (w / f['sz']) ** 2))
                    g *= 1 - ss(f.get('yg0', -0.075), f.get('yg1', -0.045), p.y)
                if 'nz' in f:  # gate on normal direction (e.g. underside only: nz<-0.3)
                    g *= ss(f['nz'][0], f['nz'][1], n.z)
                if g < 1e-4: continue
                a = f['amp'] * 0.001 * g
                dr = f.get('dir', 'n')
                if dr == 'n': d += n * a
                elif dr == 'y': d += Vector((0, -a, 0))       # + = forward (face looks to -Y)
                elif dr == 'z': d += Vector((0, 0, a))
                elif dr == 'x': d += Vector((a * s, 0, 0))   # + = outward
        return d

    disp = {}
    if SCULPT and F:
        for v in bm.verts:
            if not headish(v) or v.co.y > 0.02: continue
            d = feat_disp(v)
            if d.length > 1e-6: disp[v] = d
        for v, d in disp.items(): v.co += d
        bm.normal_update()
    # vertical stretch of the lower face (monotone cubic through old->new z knots), full on the front of the
    # face, fading out toward the ears/nape and onto the neck (Head weight), so the chin/jaw drop and the neck stays
    if '--stretch' in argv:
        ST = json.load(open(argv[argv.index('--stretch') + 1]))
        kz = np.array([k[0] for k in ST['knots']]); kn = np.array([k[1] for k in ST['knots']])
        o = np.argsort(kz); kz, kn = kz[o], kn[o]
        h = np.diff(kz); dsl = np.diff(kn) / h
        m = np.zeros(len(kz)); m[0], m[-1] = dsl[0], dsl[-1]
        for i in range(1, len(kz) - 1):   # Fritsch-Carlson monotone slopes
            m[i] = 0 if dsl[i - 1] * dsl[i] <= 0 else 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / dsl[i - 1] + (h[i] + 2 * h[i - 1]) / dsl[i])
        def fz(z):
            if z <= kz[0] or z >= kz[-1]: return z
            i = int(np.searchsorted(kz, z) - 1); t = (z - kz[i]) / h[i]
            return (kn[i] * (2 * t**3 - 3 * t**2 + 1) + h[i] * m[i] * (t**3 - 2 * t**2 + t)
                    + kn[i + 1] * (-2 * t**3 + 3 * t**2) + h[i] * m[i + 1] * (t**3 - t**2))
        y0, y1 = ST.get('yfade', [-0.035, 0.0]); w0, w1 = ST.get('headw', [0.2, 0.85])
        moved = 0; mx = 0
        for v in bm.verts:
            if v.co.z < kz[0] or v.co.z > kz[-1] or abs(v.co.x) > 0.12: continue
            w = (1 - ss(y0, y1, v.co.y)) * ss(w0, w1, v[dl].get(HEAD, 0))
            if w <= 0: continue
            dz = (fz(v.co.z) - v.co.z) * w
            if abs(dz) > 1e-7:
                v.co.z += dz; moved += 1; mx = max(mx, abs(dz)); disp[v] = Vector((0, 0, dz))
        bm.normal_update()
        log['stretch_moved'] = moved; log['stretch_max_mm'] = mx * 1000
    # local relax (ears / temples): Taubin lambda|mu on positions inside spheres {c, r, it}, smooth falloff to the rim
    if '--relax' in argv:
        RX = json.load(open(argv[argv.index('--relax') + 1]))
        bm.verts.ensure_lookup_table()
        orig_co = {}
        for z in RX:
            c = Vector(z['c']); r = z['r']
            vs = [v for v in bm.verts if (v.co - c).length < r and headish(v)]
            w = {v: ss(r, r * 0.45, (v.co - c).length) for v in vs}
            for v in vs: orig_co.setdefault(v, v.co.copy())
            for it in range(z.get('it', 12)):
                for lam in (0.55, -0.58):
                    new = {}
                    for v in vs:
                        nb = [e.other_vert(v).co for e in v.link_edges]
                        if not nb or (v.is_boundary and not z.get('boundary')): continue
                        avg = sum(nb, Vector()) / len(nb)
                        new[v] = v.co + (avg - v.co) * lam * w[v]
                    for v, p in new.items(): v.co = p
        for v, p0 in orig_co.items():
            d = v.co - p0
            if d.length > 1e-7: disp[v] = disp.get(v, Vector()) + d
        bm.normal_update()
        log['relax_moved'] = sum(1 for v, p0 in orig_co.items() if (v.co - p0).length > 1e-7)
        log['relax_max_mm'] = max(((v.co - p0).length for v, p0 in orig_co.items()), default=0) * 1000
    log['displaced'] = len(disp)
    log['maxdisp_mm'] = max((d.length for d in disp.values()), default=0) * 1000
    touched = set(disp) | new_verts
    # faces touching edited verts lose flat shading
    for f in bm.faces:
        if any(v in touched for v in f.verts): f.smooth = True
    bm.to_mesh(me); bm.free()
    me.update()

    # 3) normals: keep the original custom normals everywhere except the edited area
    tidx = set(v.index for v in me.vertices if False)
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    cn = np.array([tuple(c.vector) for c in me.corner_normals])
    vn = np.array([tuple(v.vector) for v in me.vertex_normals])
    cv = np.zeros(len(me.loops), int); me.loops.foreach_get('vertex_index', cv)
    # edited verts = displaced or new; identify by a vertex attribute written from bmesh is awkward,
    # so recompute: anything in the head zone whose position changed vs the source, or new.
    src = np.load(OUT + '_srcco.npy') if False else None
    edit = np.zeros(len(me.vertices), bool)
    hz = (co[:, 2] > 1.47) & (co[:, 1] < 0.0) & (np.abs(co[:, 0]) < 0.1)
    edit[hz] = True
    ang = np.degrees(np.arccos(np.clip((cn * vn[cv]).sum(1), -1, 1)))
    log['customVsAuto_deg_headzone_p50_p95'] = (float(np.percentile(ang[hz[cv]], 50)), float(np.percentile(ang[hz[cv]], 95)))
    newn = cn.copy()
    sel = edit[cv]
    newn[sel] = vn[cv][sel]
    if '--clearcn' in argv:
        me.attributes.remove(me.attributes['custom_normal'])
        # the source used custom normals over 312 flat faces; with them gone, keep every face smooth so the
        # exporter doesn't split extra verts (splice.py puts the original normals back outside the face)
        for p in me.polygons: p.use_smooth = True
    else:
        me.normals_split_custom_set([tuple(x) for x in newn])
    log['verts'] = len(me.vertices); log['faces'] = len(me.polygons)
    print('LOG', json.dumps(log))


# 4) renders
cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 0.26
cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
arm.hide_render = True
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x = sc.render.resolution_y = 800
cd.clip_start = 0.005
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
sh = sc.display.shading
VIEWS = [('earR', (-1, -0.02, 1.6), (90, 0, -90)), ('earRb', (-0.75, 0.75, 1.62), (90, 0, -135)), ('earL', (1, -0.02, 1.6), (90, 0, 90)), ('earLb', (0.75, 0.75, 1.62), (90, 0, 135))] if '--ears' in argv else \
    [('zoom', (0.0, -1, 1.635), (90, 0, 0)), ('zoomq', (0.5, -0.86, 1.64), (90, 0, 30)), ] if '--zoom' in argv else \
    [('nf', (0.0, -1, 1.592), (90, 0, 0)), ('nq', (0.15, -0.31, 1.585), (93, 0, 37)), ('ns', (1, -0.105, 1.588), (90, 0, 90)), ('nb', (0.0, -1, 1.40), (100.8, 0, 0)), ('nu', (0.0, -0.929, 1.001), (125, 0, 0)), ('nu2', (0.35, -0.85, 1.05), (122, 0, 25))] if '--nose' in argv else [('front', (0.0, -1, 1.585), (90, 0, 0)), ('side', (1, -0.04, 1.585), (90, 0, 90)),
         ('q3', (0.70, -0.72, 1.585), (90, 0, 44)), ('low', (0.0, -1, 1.40), (100.5, 0, 0))]
for mode in ('tex', 'clay'):
    if mode == 'tex':
        sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
    else:
        sh.light = 'STUDIO'; sh.color_type = 'SINGLE'; sh.single_color = (0.8, 0.72, 0.65)
        sh.show_cavity = False
    for name, loc, rot in VIEWS:
        cd.ortho_scale = 0.16 if name.startswith('ear') else 0.08 if name.startswith('zoom') else (0.07 if name[0] == 'n' and len(name) == 2 else 0.26)
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        sc.render.filepath = f'{OUT}_{mode}_{name}.png'
        bpy.ops.render.render(write_still=True)

if EXPORT:
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.gltf(filepath=EXPORT, export_format='GLB', use_selection=True, export_skins=True,
                              export_animations=False, export_tangents=True, export_morph=False)
    print('EXPORTED', EXPORT)
