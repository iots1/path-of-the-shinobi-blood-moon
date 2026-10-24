"""Fit and rig the FULL Meshy source in the existing Blender master.

No decimation, remesh, triangulation, image resize or texture baking. The source
object and assets/cloak.glb stay unchanged. Export assets/cloak-fitted.glb.
"""
from pathlib import Path
import bpy
import bmesh
import numpy as np
from math import sqrt, exp
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.get('CloakEquipment') or bpy.data.scenes.new('CloakEquipment')
bpy.context.window.scene = scene
source = bpy.data.objects.get('Cloak_Meshy_Source')
if source is None:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/cloak.glb'))
    source = next(o for o in set(bpy.data.objects) - before if o.type == 'MESH')
    source.name = 'Cloak_Meshy_Source'
for name in ['Cloak_Fitted_High', 'Cloak_Rig']:
    old = bpy.data.objects.get(name)
    if old is not None:
        if old.get('source') != 'assets/cloak.glb':
            raise RuntimeError('Refusing to replace unrelated object: ' + name)
        bpy.data.objects.remove(old, do_unlink=True)
old_game = bpy.data.objects.get('Cloak_Game')
if old_game:
    old_game.hide_set(True)
    old_game.hide_render = True
cloak = source.copy()
cloak.data = source.data.copy()
scene.collection.objects.link(cloak)
cloak.name = 'Cloak_Fitted_High'
cloak['source'] = 'assets/cloak.glb'
cloak.hide_set(False)
cloak.hide_render = False
for obj in bpy.context.view_layer.objects:
    obj.select_set(False)
cloak.select_set(True)
bpy.context.view_layer.objects.active = cloak
# Blender Z = height, -Y = game front. Keep the neck opening in place.
cloak.scale = (.51, .60, .52)
cloak.location = (0, .015, 1.047)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)

def profile(height, samples):
    # Monotone cubic Hermite: continuous slopes across section heights, rather
    # than a flat slope at every sample that made visible shoulder bands.
    if height <= samples[0][0]:
        return samples[0][1]
    slopes = [(b-a)/(hi-lo) for (lo,a),(hi,b) in zip(samples,samples[1:])]
    tangents = [slopes[0]]
    for left,right in zip(slopes,slopes[1:]):
        tangents.append(2*left*right/(left+right) if left*right>0 else 0)
    tangents.append(slopes[-1])
    for i, ((lo,a),(hi,b)) in enumerate(zip(samples,samples[1:])):
        if height <= hi:
            t=(height-lo)/(hi-lo)
            return (2*t**3-3*t*t+1)*a + (t**3-2*t*t+t)*(hi-lo)*tangents[i] + (-2*t**3+3*t*t)*b + (t**3-t*t)*(hi-lo)*tangents[i+1]
    return samples[-1][1]

# Smooth section profiles measured from the posed ninja, not individual shirt
# crease normals. That preserves a cloth drape instead of imprinting armour plates.
rear_profile = [(1.28,.177),(1.32,.189),(1.36,.200),(1.40,.200),(1.44,.165),(1.48,.120),(1.52,.091)]
rear_source = [(1.28,.14),(1.32,.1435),(1.36,.1562),(1.40,.1806),(1.44,.1937),(1.48,.1484),(1.52,.0969)]
front_scale = [(1.30,1),(1.32,.88),(1.36,.82),(1.40,.76),(1.44,.74),(1.48,.78),(1.52,.85)]

def raw_fit(co):
    out = Vector(co)
    x,y,height = co
    shoulder = smooth((height - 1.23) / .17) * smooth((abs(x) - .10) / .12)
    waist = smooth((1.30 - height) / .25) * (1 - .30 * smooth((.85 - height) / .25))
    neck = smooth((height - 1.47) / .06)
    out.x *= (1 + .08 * shoulder) * (1 - .12 * neck) * (1 - .25 * waist)
    out.z += .045 * shoulder * (1 - .65 * smooth((abs(x) - .18) / .10)) + .008 * neck + .014 * neck * smooth((y + .02) / .08)
    back = smooth((y + .015) / .035) * smooth((1.54 - height) / .02)
    torso_rear = .185 + .25 * (y - .13)
    upper = smooth((height - 1.28) / .04)
    upper_rear = profile(height, rear_profile) + .35 * (y - profile(height, rear_source)) + .022
    upper_rear -= .055 * smooth((abs(x) - .14) / .15)
    rear_surface = torso_rear * (1 - upper) + upper_rear * upper
    out.y = y * (1 - back) + rear_surface * back
    front = (1 - smooth((y + .015) / .035)) * smooth((height - 1.29) / .03)
    out.y += y * (profile(height, front_scale) - 1) * front
    # Keep the open side edges behind the elbow/hip hilt, not across the fist.
    opening = smooth((1.31 - height) / .25) * (1 - smooth((y + .015) / .035))
    out.y += max(0, .085 - y) * .92 * opening
    # Open the side below the shoulder cap so the upper arm emerges below
    # a continuous hem instead of punching through the middle of the mantle.
    arm_open = smooth((1.415 - height) / .12) * smooth((abs(x) - .14) / .10)
    out.y += max(0, .18 - out.y) * arm_open
    # Close the upper front collar around the neck, tapering into the original
    # chest opening and keeping the lower fastening in place.
    collar_front = (1 - smooth((y + .005) / .055)) * smooth((height - 1.39) / .10)
    out.x *= 1 - .10 * collar_front
    out.y -= .010 * neck * (1 - smooth((y + .005) / .055))
    # Smooth shoulder envelope: clearance without copying individual shirt creases.
    cap = smooth((out.z - 1.31) / .04) * (1 - smooth((out.z - 1.54) / .04))
    side = smooth((abs(out.x) - .12) / .05)
    width = profile(out.z, [(1.32,.277),(1.36,.263),(1.40,.252),(1.42,.241),(1.44,.221),(1.46,.180),(1.48,.130)])
    radius = width * sqrt(max(0, 1 - ((out.y - .035) / .15) ** 2))
    deficit = radius - abs(out.x)
    push = .5 * (deficit + sqrt(deficit * deficit + .003 ** 2))
    out.x += (1 if out.x >= 0 else -1) * push * cap * side
    # Ray-picked collar breakthrough at x=±.066, height=1.512, rear depth=.034.
    # A broad 12-mm ease gives clearance without puffing the whole collar.
    collar_ease = exp(-((abs(out.x)-.066)/.035)**2 - ((out.z-1.512)/.045)**2 - ((out.y-.034)/.08)**2)
    out.x += (1 if out.x >= 0 else -1) * .012 * collar_ease

    out.y += .065 * smooth((1.43 - height) / .16)
    out.y += .012 * exp(-((height-1.40)/.10)**2) * smooth((y+.02)/.08)
    out.x += (1 if x>=0 else -1) * .040 * exp(-((height-1.355)/.07)**2) * smooth((abs(x)-.14)/.10)
    out.x += (1 if x>=0 else -1) * .025 * exp(-((abs(x)-.20)/.08)**2 - ((height-1.405)/.08)**2 - ((y-.04)/.10)**2)
    # The mantle hem crosses the rounded sleeve below the shoulder cap.
    # Broad lateral ease keeps the stitched edge outside the sleeve surface.
    hem_ease = exp(-((abs(x)-.19)/.11)**2 - ((height-1.32)/.10)**2 - ((y+.12)/.10)**2)
    out.x += (1 if x>=0 else -1) * .070 * hem_ease
    return out

# Fit through a smooth volumetric displacement field. Source folds and stitched
# hems move together; individual triangle positions are never clamped to a shell.
rest = np.empty(len(cloak.data.vertices)*3, np.float64)
cloak.data.vertices.foreach_get('co', rest)
rest = rest.reshape(-1,3)
corner_normals = np.empty(len(cloak.data.loops)*3,np.float64)
cloak.data.corner_normals.foreach_get('vector',corner_normals)
corner_normals = corner_normals.reshape(-1,3)
loop_ids = np.empty(len(cloak.data.loops),np.int32)
cloak.data.loops.foreach_get('vertex_index',loop_ids)
spacing=.020
origin=np.floor((rest.min(axis=0)-.10)/spacing)*spacing
shape=np.ceil((rest.max(axis=0)+.10-origin)/spacing).astype(int)+1
field=np.empty(tuple(shape)+(3,),np.float64)
for idx in np.ndindex(*shape):
    co=origin+np.array(idx)*spacing
    field[idx]=np.array(raw_fit(co))-co
# Gaussian-like convolution of displacement, not the high-resolution cloth.
for _ in range(6):
    for axis in range(3):
        pads=[(0,0)]*4;pads[axis]=(1,1)
        padded=np.pad(field,pads,mode='edge')
        lo=[slice(None)]*4;mid=lo.copy();hi=lo.copy()
        lo[axis]=slice(0,-2);mid[axis]=slice(1,-1);hi[axis]=slice(2,None)
        field=.25*padded[tuple(lo)]+.5*padded[tuple(mid)]+.25*padded[tuple(hi)]

def field_fit(points):
    uv=(points-origin)/spacing
    base=np.floor(uv).astype(int)-1
    t=uv-np.floor(uv)
    weights=np.stack(((1-t)**3,(3*t**3-6*t*t+4),(-3*t**3+3*t*t+3*t+1),t**3),axis=1)/6
    deriv=np.stack((-3*(1-t)**2,9*t*t-12*t,-9*t*t+6*t+3,3*t*t),axis=1)/(6*spacing)
    offset=np.zeros_like(points)
    jac=np.broadcast_to(np.eye(3),(len(points),3,3)).copy()
    for i in range(4):
      for j in range(4):
       for k in range(4):
        value=field[base[:,0]+i,base[:,1]+j,base[:,2]+k]
        wx,wy,wz=weights[:,i,0],weights[:,j,1],weights[:,k,2]
        offset+=value*(wx*wy*wz)[:,None]
        jac[:,:,0]+=value*(deriv[:,i,0]*wy*wz)[:,None]
        jac[:,:,1]+=value*(wx*deriv[:,j,1]*wz)[:,None]
        jac[:,:,2]+=value*(wx*wy*deriv[:,k,2])[:,None]
    return points+offset,jac

fitted,jac=field_fit(rest)
determinant=np.linalg.det(jac)
strength=1.0
while determinant.min()<.15 and strength>.2:
    strength*=.9
    candidate=np.eye(3)+strength*(jac-np.eye(3))
    determinant=np.linalg.det(candidate)
fitted=rest+strength*(fitted-rest)
jac=np.eye(3)+strength*(jac-np.eye(3))
print('Field strength:',strength,'Jacobian minimum:',float(determinant.min()),'inverted:',int((determinant<=0).sum()))
assert determinant.min()>.05, 'Fit would invert/collapse the source surface'
cloak.data.vertices.foreach_set('co',fitted.ravel())
cloak.data.update()
# Transport the source's smooth custom normals through the same field, rather
# than exposing the raw scan's tiny geometric facets after recomputing normals.
inverse=np.linalg.inv(jac)
normal_matrices=inverse.transpose(0,2,1)
transported=np.einsum('nij,nj->ni',normal_matrices[loop_ids],corner_normals)
transported/=np.maximum(1e-12,np.linalg.norm(transported,axis=1))[:,None]
cloak.data.normals_split_custom_set(transported.tolist())
cloak.data.update()
cloak['source'] = 'assets/cloak.glb'
cloak['fit'] = 'Full-resolution source; shoulder/hip opening fit before optimization'
assert len(cloak.data.vertices) == len(source.data.vertices)
assert len(cloak.data.polygons) == len(source.data.polygons)

armature = bpy.data.armatures.new('Cloak_Rig_Data')
rig = bpy.data.objects.new('Cloak_Rig', armature)
scene.collection.objects.link(rig)
rig['source'] = 'assets/cloak.glb'
rig.show_in_front = True
cloak.select_set(False)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
collar = armature.edit_bones.new('Cloak_Collar')
collar.head = (0, .0, 1.43)
collar.tail = (0, .0, 1.53)
for side, x in [('L', .23), ('R', -.23)]:
    bone = armature.edit_bones.new('Cloak_Shoulder' + side)
    bone.head = (x, .02, 1.40)
    bone.tail = (x, .02, 1.48)
    bone.parent = collar
columns = [-.32, -.16, 0, .16, .32]
levels = [1.32, 1.10, .88, .66, .44]
for col, x in enumerate(columns):
    depth = .155 - .06 * (abs(x) / .32) ** 2
    for row, height in enumerate(levels):
        bone = armature.edit_bones.new(f'Cloak_{col}_{row}')
        bone.head = (x, depth, height)
        bone.tail = (x, depth, height - .22)
        bone.parent = collar if row == 0 else armature.edit_bones[f'Cloak_{col}_{row-1}']
bpy.ops.object.mode_set(mode='OBJECT')
groups = {bone.name: cloak.vertex_groups.new(name=bone.name).index for bone in armature.bones}
bm = bmesh.new()
bm.from_mesh(cloak.data)
layer = bm.verts.layers.deform.verify()
for vertex in bm.verts:
    x, depth, height = vertex.co
    weights = {}
    if height >= 1.32:
        shoulder = smooth((abs(x) - .10) / .18) * smooth((height - 1.30) / .08)
        weights['Cloak_Collar'] = 1 - shoulder
        weights['Cloak_Shoulder' + ('L' if x >= 0 else 'R')] = shoulder
    else:
        col = max(0, min(3.99999, (x + .32) / .16))
        ci = int(col)
        cu = col - ci
        row = max(0, min(3.99999, (1.32 - height) / .22))
        ri = int(row)
        ru = row - ri
        for c, wx in [(ci, 1-cu), (ci+1, cu)]:
            for r, wy in [(ri, 1-ru), (ri+1, ru)]:
                weights[f'Cloak_{c}_{r}'] = wx * wy
        # Collar transition uses at most three nonzero influences at the top.
        collar_w = smooth((height - 1.26) / .06)
        if collar_w > 0:
            weights = {name: value*(1-collar_w) for name, value in weights.items()}
            weights['Cloak_Collar'] = collar_w
    best = sorted(weights.items(), key=lambda item: -item[1])[:4]
    total = sum(value for _, value in best)
    deform = vertex[layer]
    deform.clear()
    for name, value in best:
        if value > 1e-7:
            deform[groups[name]] = value / total
bm.to_mesh(cloak.data)
bm.free()
modifier = cloak.modifiers.new('Cloak skin', 'ARMATURE')
modifier.object = rig
cloak.parent = rig
source.hide_set(True)
source.hide_render = True
for obj in bpy.context.view_layer.objects:
    obj.select_set(False)
cloak.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / 'assets/cloak-fitted.glb'), export_format='GLB',
    use_selection=True, use_active_scene=True, export_skins=True,
    export_animations=False, export_tangents=True,
)
print('FULL QUALITY:', len(cloak.data.vertices), 'vertices,', len(cloak.data.polygons), 'triangles,', len(armature.bones), 'bones')
bpy.context.window.scene = previous_scene
