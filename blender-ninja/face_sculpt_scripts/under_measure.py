import bpy, sys, numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector
GLB=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
for o in bpy.context.scene.objects:
    if o.type=='ARMATURE':
        if o.animation_data: o.animation_data.action=None
        for pb in o.pose.bones: pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
body=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bvh=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
xs=[-0.02,-0.016,-0.012,-0.009,-0.006,-0.003,0,0.003,0.006,0.009,0.012,0.016,0.02]
print('front depth y(mm) at x / z')
print('z\\x    '+' '.join(f'{x*1000:6.0f}' for x in xs))
for z in np.arange(1.585,1.549,-0.0025):
    r=[]
    for x in xs:
        h=bvh.ray_cast(Vector((x,-0.5,z)),Vector((0,1,0))); r.append(h[0].y*1000 if h[0] else 0)
    print(f'{z:.4f} '+' '.join(f'{v:6.1f}' for v in r))
print('underside z(mm-1500) from below, rows y')
for y in np.arange(-0.124,-0.095,0.002):
    r=[]
    for x in xs:
        h=bvh.ray_cast(Vector((x,y,1.45)),Vector((0,0,1)),0.2)
        r.append((h[0].z-1.5)*1000 if h[0] and h[0].z<1.62 else 0)
    print(f'y{y*1000:5.0f} '+' '.join(f'{v:6.1f}' for v in r))
