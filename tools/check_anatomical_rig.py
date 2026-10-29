"""Run in live Blender: source-preservation, constraint, and baked skin round-trip checks."""
import bpy, sys, json, copy, math
import numpy as np
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from glb_io import load, acc, node_world
OUT=ROOT/'out/anatomical-rig'
j,b=load(ROOT/'assets/ninja.glb');k,c=load(ROOT/'assets/ninja-anatomical-preview.glb')
checks={}
for key,ai in j['meshes'][0]['primitives'][0]['attributes'].items():
    if key not in ['JOINTS_0','WEIGHTS_0']:
        checks[key+'_byte_identical']=bool(np.array_equal(acc(j,b,ai),acc(k,c,k['meshes'][0]['primitives'][0]['attributes'][key])))
checks['indices_identical']=bool(np.array_equal(acc(j,b,j['meshes'][0]['primitives'][0]['indices']),acc(k,c,k['meshes'][0]['primitives'][0]['indices'])))
checks['old_animation_json_identical']=j['animations']==k['animations'][:len(j['animations'])]
checks['original_binary_prefix_identical']=bytes(b)==bytes(c[:len(b)])
checks['new_skin_82_joints']=len(k['skins'][0]['joints'])==82
checks['no_control_nodes_exported']=not any(n.get('name','').startswith(('CTRL_','MCH_')) for n in k['nodes'])
assert all(checks.values()),checks
(OUT/'surface-and-clip-check.json').write_text(json.dumps(checks,indent=2))

r=bpy.data.objects['Ninja_ExportRig'];m=bpy.data.objects['Ninja_CurrentBody'];s=bpy.data.scenes['ThreeJS_Rig']
act=r.animation_data.action;r.animation_data.action=None
results=[]
for side in ['L','R']:
    for part,axis,request,expected in [('ForeArm',0,190,145),('ForeArm',0,-40,-5),('ForeArm',2,40,0),('ForeArmRoll',1,140,85),('ArmRoll',1,-140,-90),('Hand',0,110,70),('Hand',2,-60,-25),('Shoulder',2,65,30)]:
        for p in r.pose.bones:
            if p.name.startswith('CTRL_'):p.rotation_euler=(0,0,0)
        p=r.pose.bones['CTRL_'+part+'.'+side];p.rotation_euler[axis]=math.radians(request);bpy.context.view_layer.update()
        local=r.convert_space(pose_bone=p,matrix=p.matrix,from_space='POSE',to_space='LOCAL')
        actual=math.degrees(local.to_euler('XYZ')[axis])
        results.append({'control':p.name,'axis':axis,'input':request,'expected':expected,'evaluated':actual,'pass':abs(actual-expected)<.01})
        if part.endswith('Roll'):
            name='mixamorig:'+('Left' if side=='L' else 'Right')+part.replace('Roll','')+'Twist3'
            angle=math.degrees(r.pose.bones[name].rotation_euler.y)
            results.append({'driver':name,'expected':expected,'evaluated':angle,'pass':abs(angle-expected)<.01})
for p in r.pose.bones:
    if p.name.startswith('CTRL_'):p.rotation_euler=(0,0,0)
r.animation_data.action=act
assert all(x['pass'] for x in results)
(OUT/'constraint-check.json').write_text(json.dumps({'checks':results,'failures':0},indent=2))

base=np.load(OUT/'original-positions.npy');edges=np.empty((len(m.data.edges),2),np.int32)
m.data.edges.foreach_get('vertices',edges.ravel());length=np.linalg.norm(base[edges[:,0]]-base[edges[:,1]],axis=1);valid=length>.001
attrs=k['meshes'][0]['primitives'][0]['attributes'];source_positions=acc(k,c,attrs['POSITION']);ids=acc(k,c,attrs['JOINTS_0']);weights=acc(k,c,attrs['WEIGHTS_0']);ibms=acc(k,c,k['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
sample=np.arange(0,len(base),23);homogeneous=np.column_stack((source_positions[sample],np.ones(len(sample))))
animation=k['animations'][-1];stats=[]
for f in [1,16,31,46,61,76,91,106,121]:
    s.frame_set(f);ev=m.evaluated_get(bpy.context.evaluated_depsgraph_get());em=ev.to_mesh();p=np.empty_like(base);em.vertices.foreach_get('co',p.ravel());ev.to_mesh_clear()
    ratio=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)[valid]/length[valid]
    doc=copy.deepcopy(k)
    for channel in animation['channels']:
        sampler=animation['samplers'][channel['sampler']];node=doc['nodes'][channel['target']['node']]
        node.pop('matrix',None)
        node[channel['target']['path']]=acc(k,c,sampler['output'])[f-1].tolist()
    world=node_world(doc)
    matrices=np.asarray([world[node]@ibms[i] for i,node in enumerate(k['skins'][0]['joints'])])
    output=np.zeros((len(sample),4))
    for slot in range(4):
        output+=np.einsum('nij,nj->ni',matrices[ids[sample,slot]],homogeneous)*weights[sample,slot,None]
    converted=output[:,[0,2,1]].copy();converted[:,1]*=-1
    error=float(np.max(np.linalg.norm(converted-p[sample],axis=1)))
    stats.append({'frame':f,'finite':bool(np.isfinite(p).all()),'edgeStretchP99':float(np.percentile(ratio,99)),'edgeStretchMax':float(ratio.max()),'glbRoundTripMaxErrorM':error})
assert all(x['finite'] and x['glbRoundTripMaxErrorM']<2e-5 for x in stats),stats
(OUT/'deformation-check.json').write_text(json.dumps(stats,indent=2))
s.frame_set(1)
print(json.dumps({'preservation':checks,'constraintChecks':len(results),'constraintFailures':0,'poses':stats},indent=2))
