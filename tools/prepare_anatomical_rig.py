"""Run in live Blender after importing current ninja.glb into ThreeJS_Rig.

Creates FK authoring controls without changing the 70 original bind matrices.
Additional twist joints require baked animation or the supplied runtime recipe.
Never exports over the live game asset.
"""
import bpy
import numpy as np
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out' / 'anatomical-rig'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes['ThreeJS_Rig']
bpy.context.window.scene = scene
rig = bpy.data.objects['Ninja_ExportRig']
mesh = bpy.data.objects['Ninja_CurrentBody']
assert len(rig.data.bones) == 70, 'Start with a fresh import, not an already processed rig'
source_actions = set()
if rig.animation_data:
    if rig.animation_data.action:
        source_actions.add(rig.animation_data.action.name)
    rig.animation_data_clear()
for p in rig.pose.bones:
    p.matrix_basis.identity()
bpy.context.view_layer.update()
bind = {b.name: b.matrix_local.copy() for b in rig.data.bones}
positions = np.empty((len(mesh.data.vertices), 3), dtype=np.float32)
mesh.data.vertices.foreach_get('co', positions.ravel())
np.save(OUT / 'original-positions.npy', positions)
original_groups = [g.name for g in mesh.vertex_groups]
weights = np.zeros((len(positions), len(original_groups)), dtype=np.float32)
for v in mesh.data.vertices:
    for g in v.groups:
        weights[v.index, g.group] = g.weight
np.savez_compressed(OUT / 'original-weights.npz', weights=weights, names=original_groups)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
spec = {}
for side, short in [('Left', 'L'), ('Right', 'R')]:
    prefix = 'mixamorig:' + side
    controls = {}
    for part in ['Shoulder', 'Arm', 'ForeArm', 'Hand']:
        original = eb[prefix + part]
        ctrl = eb.new('CTRL_' + part + '.' + short)
        ctrl.head, ctrl.tail = original.head.copy(), original.tail.copy()
        ctrl.use_deform = False
        if part == 'Shoulder':
            ctrl.matrix = original.matrix.copy()
            ctrl.length = original.length
            ctrl.parent = original.parent
        else:
            y = (ctrl.tail - ctrl.head).normalized()
            # Z points toward the front for the elbow; palm dorsal for the wrist.
            reference = Vector((0, 0, 1)) if part == 'Hand' else Vector((0, -1, 0))
            ctrl.align_roll((reference - y * reference.dot(y)).normalized())
            ctrl.parent = controls['Shoulder'] if part == 'Arm' else controls['ArmRoll'] if part == 'ForeArm' else controls['ForeArmRoll']
        controls[part] = ctrl
        if part in ['Arm', 'ForeArm']:
            roll = eb.new('CTRL_' + part + 'Roll.' + short)
            roll.head, roll.tail = ctrl.head.copy(), ctrl.tail.copy()
            roll.matrix = ctrl.matrix.copy()
            roll.length = ctrl.length
            roll.parent = ctrl
            roll.use_deform = False
            controls[part + 'Roll'] = roll
        # A rest-aligned target converts control orientation to original bind axes.
        target = eb.new('MCH_' + part + '.' + short)
        target.head, target.tail = original.head.copy(), original.tail.copy()
        target.matrix = original.matrix.copy()
        target.length = original.length
        target.parent = ctrl
        target.use_deform = False
        spec[prefix + part] = target.name
        if part in ['Arm', 'ForeArm']:
            for k in range(1, 4):
                twist = eb.new(prefix + part + 'Twist' + str(k))
                twist.head, twist.tail = original.head.copy(), original.tail.copy()
                twist.matrix = original.matrix.copy()
                twist.length = original.length
                twist.parent = original
                twist.use_deform = True
bpy.ops.object.mode_set(mode='OBJECT')

limits = {}
def limit(name, lo, hi):
    p = rig.pose.bones[name]
    p.rotation_mode = 'XYZ'
    p.lock_location = (True,) * 3
    p.lock_scale = (True,) * 3
    p.lock_rotation = tuple(a == b for a, b in zip(lo, hi))
    c = p.constraints.new('LIMIT_ROTATION')
    c.name = 'Anatomical range (control local axes)'
    c.owner_space = 'LOCAL'
    c.use_limit_x = c.use_limit_y = c.use_limit_z = True
    c.min_x, c.min_y, c.min_z = [math.radians(v) for v in lo]
    c.max_x, c.max_y, c.max_z = [math.radians(v) for v in hi]
    c.use_transform_limit = True
    limits[name] = {'minDegrees': lo, 'maxDegrees': hi}
    p['usage'] = 'Pose this control; limits are authoring ranges, not a biomechanical simulation.'
    p.bone.color.palette = 'THEME04'

for short in ['L', 'R']:
    limit('CTRL_Shoulder.' + short, (-25, -20, -30), (40, 20, 30))
    limit('CTRL_Arm.' + short, (-120, 0, -100), (145, 0, 100))
    limit('CTRL_ArmRoll.' + short, (0, -90, 0), (0, 90, 0))
    limit('CTRL_ForeArm.' + short, (-5, 0, 0), (145, 0, 0))
    limit('CTRL_ForeArmRoll.' + short, (0, -85, 0), (0, 85, 0))
    limit('CTRL_Hand.' + short, (-70, -15, -25), (70, 15, 25))

for name, target in spec.items():
    c = rig.pose.bones[name].constraints.new('COPY_TRANSFORMS')
    c.name = 'Follow anatomical FK control'
    c.target = rig
    c.subtarget = target
    c.owner_space = c.target_space = 'POSE'
    rig.pose.bones[name].bone.color.palette = 'THEME03'

for side, short in [('Left', 'L'), ('Right', 'R')]:
    for part in ['Arm', 'ForeArm']:
        for k in range(1, 4):
            p = rig.pose.bones['mixamorig:' + side + part + 'Twist' + str(k)]
            p.rotation_mode = 'XYZ'
            d = p.driver_add('rotation_euler', 1).driver
            # Read the evaluated constrained matrix, never unconstrained input Euler.
            # TRANSFORMS variables read the evaluated local rotation after limits.
            v = d.variables.new(); v.name = 'roll'; v.type = 'TRANSFORMS'
            v.targets[0].id = rig
            v.targets[0].bone_target = 'CTRL_' + part + 'Roll.' + short
            v.targets[0].transform_type = 'ROT_Y'
            v.targets[0].transform_space = 'LOCAL_SPACE'
            d.expression = 'roll * ' + str(k / 3)
            p.bone.color.palette = 'THEME02'

# Local edge smoothing of existing weights, preserving all finger weights.
edges = np.empty((len(mesh.data.edges), 2), dtype=np.int32)
mesh.data.edges.foreach_get('vertices', edges.ravel())
degree = np.bincount(edges.ravel(), minlength=len(positions)).clip(1)
changed_regions = {}
for side in ['Left', 'Right']:
    names = ['mixamorig:' + side + p for p in ['Shoulder', 'Arm', 'ForeArm', 'Hand']]
    ids = [original_groups.index(n) for n in names]
    # Reserve the four-influence budget near the shoulder for a continuous arm
    # transition. Three competing spine joints otherwise evict the arm weight
    # on alternating adjacent vertices after top-four pruning.
    shoulder = np.array(rig.data.bones[names[1]].head_local)
    near_shoulder = np.linalg.norm(positions - shoulder, axis=1) < .19
    near_shoulder &= weights[:, ids[:2]].sum(axis=1) > .01
    spine_ids = [original_groups.index('mixamorig:' + n) for n in ['Spine', 'Spine1', 'Spine2']]
    spine_total = weights[:, spine_ids].sum(axis=1)
    for i in spine_ids: weights[near_shoulder, i] = 0
    weights[near_shoulder, spine_ids[-1]] = spine_total[near_shoulder]
    region = np.zeros(len(positions), dtype=np.float32)
    for name, radius in zip(names[1:], [.17, .065, .075]):
        center = np.array(rig.data.bones[name].head_local)
        distance = np.linalg.norm(positions - center, axis=1)
        region = np.maximum(region, np.clip(1 - distance / radius, 0, 1))
    finger_ids = [i for i, n in enumerate(original_groups) if n.startswith('mixamorig:' + side + 'Hand') and n != names[-1]]
    region[weights[:, finger_ids].sum(axis=1) > .001] = 0
    region *= np.clip(weights[:, ids].sum(axis=1) / .2, 0, 1)
    smooth_ids = ids + [spine_ids[-1]]
    total = weights[:, smooth_ids].sum(axis=1)
    w = weights[:, smooth_ids].copy()
    for iteration in range(12):
        average = np.zeros_like(w)
        for k in range(len(smooth_ids)):
            average[:, k] = (np.bincount(edges[:, 0], weights=w[edges[:, 1], k], minlength=len(w)) + np.bincount(edges[:, 1], weights=w[edges[:, 0], k], minlength=len(w))) / degree
        w += (average - w) * (region[:, None] * .5)
        w *= (total / np.maximum(w.sum(axis=1), 1e-12))[:, None]
    weights[:, smooth_ids] = w
    # A longitudinal cuff transition removes noisy auto-weight jumps between
    # immediately adjacent sleeve/glove vertices, without touching finger skin.
    fore = rig.data.bones[names[2]]
    axis = np.array(fore.tail_local - fore.head_local)
    axis /= np.linalg.norm(axis)
    wrist = np.array(rig.data.bones[names[3]].head_local)
    along = (positions - wrist) @ axis
    distance = np.linalg.norm(positions - wrist, axis=1)
    eligible = (distance < .085) & (weights[:, finger_ids].sum(axis=1) < .001) & (weights[:, ids[2:]].sum(axis=1) > .95)
    fraction = np.clip((along + .045) / .075, 0, 1)
    fraction = fraction * fraction * (3 - 2 * fraction)
    pair = weights[:, ids[2:]].sum(axis=1)
    weights[eligible, ids[2]] = pair[eligible] * (1 - fraction[eligible])
    weights[eligible, ids[3]] = pair[eligible] * fraction[eligible]
    changed_regions[side] = int(np.count_nonzero(region))

# Twist weights use adjacent stations along each segment, not a rigid wrist twist.
names = list(original_groups)
extra = []
for side in ['Left', 'Right']:
    for part in ['Arm', 'ForeArm']:
        name = 'mixamorig:' + side + part
        b = rig.data.bones[name]
        h, tail = np.array(b.head_local), np.array(b.tail_local)
        axis = tail - h
        t = np.clip(((positions - h) @ axis) / (axis @ axis), 0, 1)
        # Keep the attachment to the torso/elbow untwisted. This also avoids
        # introducing a fifth competing weight in the shoulder transition.
        t = np.clip((t - (.35 if part == 'Arm' else .15)) / (.65 if part == 'Arm' else .85), 0, 1)
        # Avoid over-twisting the shoulder/elbow attachment itself.
        t = t * t * (3 - 2 * t)
        value = t * 3
        original = weights[:, names.index(name)].copy()
        weights[:, names.index(name)] = original * np.clip(1 - value, 0, 1)
        for k in range(1, 4):
            n = name + 'Twist' + str(k)
            if not mesh.vertex_groups.get(n): mesh.vertex_groups.new(name=n)
            names.append(n)
            extra.append(original * np.clip(1 - np.abs(value - k), 0, 1))
weights = np.column_stack([weights] + extra)

# Coincident UV seam vertices receive identical skin weights.
_, seam_id, seam_count = np.unique(np.round(positions * 1e6).astype(np.int64), axis=0, return_inverse=True, return_counts=True)
seam_vertices = seam_count[seam_id] > 1
for k in range(weights.shape[1]):
    mean = np.bincount(seam_id, weights=weights[:, k]) / seam_count
    weights[seam_vertices, k] = mean[seam_id[seam_vertices]]

# Match standard Three.js four-weight skinning. Drop only the smallest influences.
keep = np.argpartition(weights, -4, axis=1)[:, -4:]
values = np.take_along_axis(weights, keep, axis=1)
values /= np.maximum(values.sum(axis=1, keepdims=True), 1e-12)
import bmesh
bm = bmesh.new(); bm.from_mesh(mesh.data)
layer = bm.verts.layers.deform.verify()
for v in bm.verts:
    d = v[layer]; d.clear()
    for i, weight in zip(keep[v.index], values[v.index]):
        if weight > 1e-7:
            d[int(i)] = float(weight)
bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
# Validate standard linear skinning too; preserve volume is a Blender-only preview choice.
for m in mesh.modifiers:
    if m.type == 'ARMATURE':
        m.use_deform_preserve_volume = False
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 121
rig.show_in_front = True
rig.data.display_type = 'STICK'
controls = rig.data.collections.new('01 Pose controls (rotate these)')
deform = rig.data.collections.new('02 Original game joints')
twists = rig.data.collections.new('03 Twist deform joints')
mechanism = rig.data.collections.new('04 Internal rest-axis adapters')
for b in rig.data.bones:
    for collection in list(b.collections): collection.unassign(b)
    (controls if b.name.startswith('CTRL_') else mechanism if b.name.startswith('MCH_') else twists if 'Twist' in b.name else deform).assign(b)
mechanism.is_visible = twists.is_visible = deform.is_visible = False
bpy.context.view_layer.update()
rest_error = max(max(abs(float(rig.pose.bones[n].matrix[i][j] - matrix[i][j])) for i in range(4) for j in range(4)) for n, matrix in bind.items())
assert rest_error < 1e-5, rest_error
report = {'source': str(ROOT / 'assets/ninja.glb'), 'blend': bpy.data.filepath, 'scene': scene.name,
          'rig': rig.name, 'mesh': mesh.name, 'vertices': len(positions), 'originalJoints':70,
          'deformJoints': sum(b.use_deform for b in rig.data.bones), 'restMatrixMaxError':rest_error,
          'smoothedVerticesBySide':changed_regions, 'maxInfluences':4, 'limits':limits,
          'twistRule':'Arm/ForeArmTwist1..3 local Y = constrained matching CTRL roll Y * (1/3,2/3,1)',
          'previewSkinning':'linear, compatible with default Three.js; game already supports DQ',
          'runtime':'Bake evaluated deform motion; glTF does not execute Blender constraints or drivers.'}
(OUT / 'rig-report.json').write_text(json.dumps(report, indent=2))
(ROOT / 'blender-ninja' / 'anatomical-rig-limits.json').write_text(json.dumps(report, indent=2))
rig['rig_instructions'] = 'Use blue CTRL bones. Elbow X bends; separate ArmRoll/ForeArmRoll Y twists. Bake deform bones for GLB. Controls are not game joints.'
print(json.dumps(report, indent=2))
