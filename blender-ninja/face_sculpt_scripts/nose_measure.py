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
def depth(x,z):
    h=bvh.ray_cast(Vector((x,-0.5,z)),Vector((0,1,0))); return h[0].y*1000 if h[0] else 0
xs=[-0.024,-0.02,-0.016,-0.012,-0.008,-0.004,0,0.004,0.008,0.012,0.016,0.02,0.024]
print('x(mm):  '+' '.join(f'{x*1000:6.0f}' for x in xs))
for z in np.arange(1.630,1.559,-0.0025):
    print(f'{z:.4f} '+' '.join(f'{depth(x,z):6.1f}' for x in xs))
# underside: rays from below
print('underside z (ray up) at y rows')
for y in (-0.122,-0.118,-0.114,-0.110,-0.106,-0.102):
    row=[]
    for x in xs:
        h=bvh.ray_cast(Vector((x,y,1.50)),Vector((0,0,1)))
        row.append(h[0].z*1000-1500 if h[0] else 0)
    print(f'y{y*1000:.0f} '+' '.join(f'{v:6.1f}' for v in row))
