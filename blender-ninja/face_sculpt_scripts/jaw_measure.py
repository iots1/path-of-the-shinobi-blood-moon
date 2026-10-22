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
print('SAGITTAL front profile x=0: z -> y (mm, more negative = more forward)')
for z in np.arange(1.56,1.43,-0.005):
    h=bvh.ray_cast(Vector((0,-0.5,z)),Vector((0,1,0)))
    print(f'  z{z*1000:.0f}: y {h[0].y*1000:6.1f}' if h[0] else f'  z{z*1000:.0f}: -')
print('JAW UNDERSIDE: ray up from below, z (mm) at (x, y)')
ys=np.arange(-0.10,0.031,0.01)
print('x\\y   '+' '.join(f'{y*1000:5.0f}' for y in ys))
for x in (0,0.015,0.03,0.045,0.055,0.065):
    row=[]
    for y in ys:
        h=bvh.ray_cast(Vector((x,y,1.30)),Vector((0,0,1)),0.35)
        row.append(h[0].z*1000 if h[0] and h[0].z<1.56 else 0)
    print(f'x{x*1000:3.0f} '+' '.join(f'{v:5.0f}' for v in row))
print('SIDE silhouette: ray from +x side, outermost x at (y,z)')
for z in (1.54,1.52,1.50,1.48,1.46):
    row=[]
    for y in np.arange(-0.08,0.031,0.01):
        h=bvh.ray_cast(Vector((0.5,y,z)),Vector((-1,0,0)))
        row.append(h[0].x*1000 if h[0] else 0)
    print(f'z{z*1000:.0f} '+' '.join(f'{v:5.0f}' for v in row))
