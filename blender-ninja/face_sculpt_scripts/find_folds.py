import bpy, bmesh, sys, math
GLB=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
body=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
vg={g.name:g.index for g in body.vertex_groups}; H=vg['mixamorig:Head']
bm=bmesh.new(); bm.from_mesh(body.data)
dl=bm.verts.layers.deform.active
bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if v.co.z>1.45], dist=1e-5)
bm.normal_update()
res=[]
for e in bm.edges:
    if len(e.link_faces)!=2: continue
    a,b=e.verts
    if a.co.z<1.5 or abs(a.co.x)<0.05: continue
    if a[dl].get(H,0)<0.3: continue
    f1,f2=e.link_faces
    d=math.degrees(f1.normal.angle(f2.normal,0))
    if d>110: res.append((round(a.co.x,3),round(a.co.y,3),round(a.co.z,3),round(d)))
print('folded edges',len(res))
from collections import Counter
c=Counter((round(x,2),round(y,2),round(z,2)) for x,y,z,_ in res)
for k,n in sorted(c.items(), key=lambda t:-t[1])[:40]: print(k,n)
