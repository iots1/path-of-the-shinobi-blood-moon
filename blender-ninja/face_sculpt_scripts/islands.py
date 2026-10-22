import bpy, bmesh, sys
GLB=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
body=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bm=bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
bm.faces.ensure_lookup_table()
seen=set(); comps=[]
for f in bm.faces:
    if f in seen: continue
    st=[f]; comp=[]; seen.add(f)
    while st:
        g=st.pop(); comp.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h not in seen: seen.add(h); st.append(h)
    comps.append(comp)
comps.sort(key=len)
print('components',len(comps),'sizes (largest 5)',[len(c) for c in comps[-5:]])
for c in comps:
    cen=sum((f.calc_center_median() for f in c), bpy.types.Object.bl_rna and __import__('mathutils').Vector())/len(c)
    if cen.z>1.5 and len(c)<200:
        print(len(c), tuple(round(x,3) for x in cen))
