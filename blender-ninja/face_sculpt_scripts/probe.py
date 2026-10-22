import bpy, sys, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
GLB=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
for o in bpy.context.scene.objects:
    if o.type=='ARMATURE':
        if o.animation_data: o.animation_data.action=None
        for pb in o.pose.bones: pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
body=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
me=body.data; uv=me.uv_layers.active.data
bvh=BVHTree.FromPolygons([v.co for v in me.vertices],[p.vertices for p in me.polygons])
def probe(name,pos,rotz,tx,ty,scale=0.08,tile=400):
    a=math.radians(rotz)
    look=Vector((-math.sin(a)*-1 if False else math.sin(-a)*-1,0,0))
    # camera rot (90,0,rotz): look = Rz(rotz)*(0,1,0), right = Rz(rotz)*(1,0,0)
    look=Vector((-math.sin(a),math.cos(a),0)); right=Vector((math.cos(a),math.sin(a),0))
    mm=scale/tile
    o=Vector(pos)+right*((tx-tile/2)*mm)+Vector((0,0,1))*((tile/2-ty)*mm)
    hits=[]; p=o.copy()
    for k in range(4):
        h=bvh.ray_cast(p,look,2.0)
        if not h[0]: break
        f=me.polygons[h[2]]
        u=[tuple(round(c,4) for c in uv[li].uv) for li in f.loop_indices]
        hits.append((tuple(round(c,4) for c in h[0]), h[2], tuple(round(c,2) for c in f.normal), u[0], round(h[3]*1000,1)))
        p=h[0]+look*1e-4
    print(name, 'origin', tuple(round(c,4) for c in o))
    for hh in hits: print('   hit', hh)
probe('mqr-mouthcorner',(-0.573,-0.919,1.540),-35,105,205)
probe('mqr-mouthcorner2',(-0.573,-0.919,1.540),-35,120,200)
probe('mf-nosepatch',(0.0,-1,1.540),0,150,60)
probe('mf-nosepatch2',(0.0,-1,1.540),0,145,75)
