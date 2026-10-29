"""Live Blender: export a control-free GLB with byte-preserved source surfaces/clips.

Appends baked deformation samples and extra twist joints to the current GLB.
No dependency on Blender's exporter re-encoding images/UVs/normals/old clips.
"""
import bpy, sys, json, struct, math, hashlib
import numpy as np
from pathlib import Path
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from glb_io import load, acc, node_world
OUT = ROOT / 'out' / 'anatomical-rig'
source = ROOT / 'assets/ninja.glb'
destination = ROOT / 'assets/ninja-anatomical-preview.glb'
j, binary = load(source)
binary = bytearray(binary)
rig = bpy.data.objects['Ninja_ExportRig']
mesh = bpy.data.objects['Ninja_CurrentBody']
scene = bpy.data.scenes['ThreeJS_Rig']
attrs = j['meshes'][0]['primitives'][0]['attributes']
original_positions = acc(j, binary, attrs['POSITION']).copy()
positions = np.empty((len(mesh.data.vertices), 3), dtype=np.float32)
mesh.data.vertices.foreach_get('co', positions.ravel())
converted = positions[:, [0, 2, 1]].copy(); converted[:, 2] *= -1
assert np.array_equal(positions, np.load(OUT / 'original-positions.npy')), 'Mesh changed since preparation'
# Blender applies float32 import transforms; observed worst residual is 1.13 micrometres.
assert np.max(np.abs(original_positions - converted)) < 2e-6, 'Vertex order/positions changed'

skin = j['skins'][0]
old_joints = list(skin['joints'])
names = [j['nodes'][i]['name'] for i in old_joints]
old_ibms = acc(j, binary, skin['inverseBindMatrices']).copy()
world = [Matrix(m.tolist()) for m in node_world(j)]
parent_node = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}
twist_parent = {}
for side in ['Left', 'Right']:
    for part in ['Arm', 'ForeArm']:
        parent = 'mixamorig:' + side + part
        for k in range(1, 4):
            name = parent + 'Twist' + str(k)
            node = len(j['nodes'])
            parent_index = old_joints[names.index(parent)]
            j['nodes'].append({'name': name})
            j['nodes'][parent_index].setdefault('children', []).append(node)
            skin['joints'].append(node)
            parent_node[node] = parent_index
            world.append(world[parent_index].copy())
            names.append(name)
            twist_parent[name] = parent

def append_accessor(data, component_type, kind, bounds=False):
    data = np.asarray(data)
    while len(binary) % 4: binary.append(0)
    offset = len(binary)
    binary.extend(data.tobytes())
    view = len(j['bufferViews'])
    j['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': data.nbytes})
    a = {'bufferView': view, 'componentType': component_type, 'count': len(data), 'type': kind}
    if bounds:
        a['min'] = np.min(data, axis=0).reshape(-1).tolist()
        a['max'] = np.max(data, axis=0).reshape(-1).tolist()
    idx = len(j['accessors']); j['accessors'].append(a)
    return idx

ibms = [m for m in old_ibms]
for name in names[70:]:
    ibms.append(old_ibms[names.index(twist_parent[name])])
skin['inverseBindMatrices'] = append_accessor(np.asarray(ibms, dtype='<f4'), 5126, 'MAT4')
name_index = {n: i for i, n in enumerate(names)}
group_index = {g.index: name_index[g.name] for g in mesh.vertex_groups}
ids = np.zeros((len(positions), 4), dtype='<u2')
weights = np.zeros((len(positions), 4), dtype='<f4')
for v in mesh.data.vertices:
    groups = [(group_index[g.group], g.weight) for g in v.groups if g.weight > 0]
    assert len(groups) <= 4
    for k, (i, w) in enumerate(groups): ids[v.index, k], weights[v.index, k] = i, w
assert np.max(np.abs(weights.sum(axis=1) - 1)) < 1e-6
attrs['JOINTS_0'] = append_accessor(ids, 5123, 'VEC4')
attrs['WEIGHTS_0'] = append_accessor(weights, 5126, 'VEC4')

controls = [p for p in rig.pose.bones if p.name.startswith('CTRL_')]
for p in controls: p.rotation_euler = (0, 0, 0)
if rig.animation_data and rig.animation_data.action:
    previous_action = rig.animation_data.action
    rig.animation_data.action = None
    if previous_action.name.startswith('Anatomical_Rig_Validation'):
        bpy.data.actions.remove(previous_action)
bpy.context.view_layer.update()
# Convert Blender's imported bone-axis convention back to the original glTF node frame.
C = Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
correction = {}
for name, node in zip(names, skin['joints']):
    correction[name] = (C @ rig.matrix_world @ rig.data.bones[name].matrix_local).inverted() @ world[node]

poses = {
 1: {},
 16: {'ForeArm': (90,0,0)},
 31: {'ForeArm': (90,0,0), 'ForeArmRoll': (0,75,0)},
 46: {'ForeArm': (90,0,0), 'ForeArmRoll': (0,-75,0), 'Hand': (45,0,0)},
 61: {'ForeArm': (110,0,0), 'Hand': (-45,0,20)},
 76: {'Arm': (75,0,0), 'ForeArm': (70,0,0), 'ArmRoll': (0,45,0)},
 91: {'Shoulder': (15,0,10), 'Arm': (110,0,15), 'ForeArm': (90,0,0), 'ForeArmRoll': (0,45,0)},
 106: {'Arm': (20,0,0), 'ForeArm': (130,0,0), 'ArmRoll': (0,-60,0), 'ForeArmRoll': (0,80,0)},
 121: {}
}
for frame, pose in poses.items():
    for p in controls: p.rotation_euler = (0, 0, 0)
    for short in ['L', 'R']:
        for part, angles in pose.items():
            rig.pose.bones['CTRL_' + part + '.' + short].rotation_euler = tuple(math.radians(a) for a in angles)
    for p in controls: p.keyframe_insert('rotation_euler', frame=frame, group=p.name)
action = rig.animation_data.action
action.name = 'Anatomical_Rig_Validation'
action.use_fake_user = True
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for f in bag.fcurves:
                for k in f.keyframe_points: k.interpolation = 'LINEAR'

samples = {name: {'translation': [], 'rotation': [], 'scale': []} for name in names}
finite = True
for frame in range(1, 122):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    posed = {node: C @ rig.matrix_world @ rig.pose.bones[name].matrix @ correction[name] for name, node in zip(names, skin['joints'])}
    for name, node in zip(names, skin['joints']):
        parent = parent_node.get(node)
        parent_world = posed.get(parent, world[parent] if parent is not None else Matrix.Identity(4))
        local = parent_world.inverted() @ posed[node]
        t, q, s = local.decompose()
        qxyzw = [q.x, q.y, q.z, q.w]
        previous = samples[name]['rotation']
        if previous and np.dot(previous[-1], qxyzw) < 0: qxyzw = [-x for x in qxyzw]
        samples[name]['translation'].append(list(t))
        samples[name]['rotation'].append(qxyzw)
        samples[name]['scale'].append(list(s))
        finite = finite and all(math.isfinite(float(v)) for row in local for v in row)
assert finite
times = append_accessor(np.arange(121, dtype='<f4') / 30, 5126, 'SCALAR', True)
animation = {'name': 'Anatomical_Rig_Validation', 'channels': [], 'samplers': []}
for name, node in zip(names, skin['joints']):
    for path, data in samples[name].items():
        output = append_accessor(np.asarray(data, dtype='<f4'), 5126, 'VEC4' if path == 'rotation' else 'VEC3')
        sampler = len(animation['samplers'])
        animation['samplers'].append({'input': times, 'output': output, 'interpolation': 'LINEAR'})
        animation['channels'].append({'sampler': sampler, 'target': {'node': node, 'path': path}})
j.setdefault('animations', []).append(animation)
j.setdefault('extras', {})['anatomicalRig'] = {'authoringScene':'ThreeJS_Rig','validationClip':'Anatomical_Rig_Validation','limitsFile':'blender-ninja/anatomical-rig-limits.json','note':'Constraints and drivers are baked only in the validation clip. Runtime procedural poses must also drive twist joints.'}
j['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(j, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
result = struct.pack('<III', 0x46546c67, 2, 12+8+len(encoded)+8+len(binary)) + struct.pack('<II',len(encoded),0x4e4f534a) + encoded + struct.pack('<II',len(binary),0x004e4942) + binary
destination.write_bytes(result)
scene.frame_set(1)
report = {'candidate':str(destination),'bytes':len(result),'joints':len(names),'originalClipsPreserved':True,'imagesAndSurfacesPreserved':True,'vertexOrderMaxError':float(np.max(np.abs(original_positions-converted))),'weightsMaxSumError':float(np.max(np.abs(weights.sum(axis=1)-1))),'bakedFrames':121,'bakedSeconds':4,'allMatricesFinite':finite}
(OUT / 'export-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
