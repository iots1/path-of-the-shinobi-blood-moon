"""Run in Blender: local shoulder fit + anatomical shoulder/elbow weights.
Preserves source topology/UV/images/clips; writes the derivative used by the game.
Always starts from the verified pre-edit backup, never its own output.
"""
import bpy, bmesh, sys, json, struct, hashlib
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from glb_io import load,acc
SOURCE=ROOT/'blender-ninja/backups/before-elbow-shoulder-20261026-195339/ninja-anatomical-preview.glb'
OUT=ROOT/'out/elbow-shoulder';OUT.mkdir(parents=True,exist_ok=True)
j,binary=load(SOURCE);binary=bytearray(binary)
attrs=j['meshes'][0]['primitives'][0]['attributes']
source_positions=acc(j,binary,attrs['POSITION']).copy()
positions=source_positions[:,[0,2,1]].copy();positions[:,1]*=-1
rig=bpy.data.objects['Ninja_ExportRig'];mesh=bpy.data.objects['Ninja_CurrentBody']
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
assert len(mesh.data.vertices)==len(positions)
names=[j['nodes'][n]['name'] for n in j['skins'][0]['joints']]
weights=np.zeros((len(positions),len(names)),np.float32)
old_ids=acc(j,binary,attrs['JOINTS_0']).copy();old_weights=acc(j,binary,attrs['WEIGHTS_0']).copy()
for slot in range(4):np.add.at(weights,(np.arange(len(positions)),old_ids[:,slot]),old_weights[:,slot])
original=weights.copy()
def smooth(x):
    t=np.clip(x,0,1);return t*t*(3-2*t)
def bone(side,part):return rig.data.bones['mixamorig:'+side+part]
def family(side,part):return [names.index('mixamorig:'+side+part+s) for s in ['', 'Twist1','Twist2','Twist3']]
regions={}
for side in ['Left','Right']:
    upper=family(side,'Arm');fore=family(side,'ForeArm');clav=names.index('mixamorig:'+side+'Shoulder')
    spine=[names.index('mixamorig:'+n) for n in ['Spine','Spine1','Spine2']]
    shoulder=np.array(bone(side,'Arm').head_local);elbow=np.array(bone(side,'ForeArm').head_local);wrist=np.array(bone(side,'Hand').head_local)
    u=(elbow-shoulder);u/=np.linalg.norm(u);f=(wrist-elbow);f/=np.linalg.norm(f)
    # The sleeve cap follows clavicle near the root; the moving upper-arm
    # influence grows outside it. Keep the underside attached to the chest.
    delta=positions-shoulder;s=delta@u;distance=np.linalg.norm(delta,axis=1)
    mask=(1-smooth((distance-.105)/.075))*smooth((np.abs(positions[:,0])-.095)/.045)
    ids=spine+[clav]+upper;total=weights[:,ids].sum(axis=1)
    underside=smooth((positions[:,2]-(shoulder[2]-.145))/.11)
    # The underside attaches to the torso only close to the shoulder root.
    # Farther down the sleeve it must follow the upper arm, even below that root.
    underside=underside+(1-underside)*smooth((s-.025)/.065)
    arm_fraction=smooth((s+.015)/.09)*underside
    clav_fraction=smooth((np.abs(positions[:,0])-.105)/.075)*smooth((positions[:,2]-(shoulder[2]-.17))/.10)
    spine_values=weights[:,spine];spine_total=spine_values.sum(axis=1)
    ratios=spine_values/np.maximum(spine_total[:,None],1e-12)
    ratios[spine_total<1e-8,-1]=1
    target=np.zeros((len(positions),len(ids)),np.float32)
    target[:,:3]=ratios*(total*(1-arm_fraction)*(1-clav_fraction))[:,None]
    target[:,3]=total*(1-arm_fraction)*clav_fraction
    target[:,4]=total*arm_fraction
    # Upper family is repopulated into twist stations below.
    existing=weights[:,ids].copy();existing[:,4]=weights[:,upper].sum(axis=1);existing[:,5:]=0
    weights[:,ids]=existing*(1-mask[:,None])+target*mask[:,None]
    # Remove distant torso/clavicle leakage before the four-weight cap. Otherwise
    # 5% spine and 5% forearm compete for slot four on neighboring sleeve vertices.
    limb_total=weights[:,upper+fore].sum(axis=1)
    release=smooth((s-.05)/.10)*smooth((limb_total-.35)/.45)
    body_ids=spine+[clav]
    released=weights[:,body_ids].sum(axis=1)*release
    weights[:,body_ids]*=(1-release[:,None])
    weights[:,upper[0]]+=released
    # A continuous hinge band, rather than disconnected auto-weight patches.
    bisector=u+f;bisector/=np.linalg.norm(bisector)
    signed=(positions-elbow)@bisector
    e_distance=np.linalg.norm(positions-elbow,axis=1)
    e_mask=(1-smooth((e_distance-.12)/.055))
    family_total=weights[:,upper+fore].sum(axis=1)
    e_mask*=smooth((family_total-.8)/.18)
    fore_fraction=smooth((signed+.07)/.14)
    upper_total=weights[:,upper].sum(axis=1)
    fore_total=weights[:,fore].sum(axis=1)
    upper_total=upper_total*(1-e_mask)+family_total*(1-fore_fraction)*e_mask
    fore_total=fore_total*(1-e_mask)+family_total*fore_fraction*e_mask
    # Cloth thickness can put a sleeve vertex outside the spherical brush even
    # though it lies well up/down the limb. Remove these remote joint leaks.
    proximal=1-smooth((signed+.11)/.04)
    distal=smooth((signed-.07)/.04)
    moved_to_upper=fore_total*proximal
    moved_to_fore=upper_total*distal
    upper_total+=moved_to_upper-moved_to_fore
    fore_total+=moved_to_fore-moved_to_upper
    for part,group,total in [('Arm',upper,upper_total),('ForeArm',fore,fore_total)]:
        b=bone(side,part);h=np.array(b.head_local);axis=np.array(b.tail_local)-h
        t=np.clip(((positions-h)@axis)/(axis@axis),0,1)
        start=.15 if part=='Arm' else .15
        station=smooth((t-start)/(1-start))*3
        for k,index in enumerate(group):weights[:,index]=total*np.clip(1-np.abs(station-k),0,1)
    regions[side]={'shoulderVertices':int((mask>1e-5).sum()),'elbowVertices':int((e_mask>1e-5).sum())}

# Coincident UV seam copies must have identical weights.
_,seams,counts=np.unique(np.round(positions*1e6).astype(np.int64),axis=0,return_inverse=True,return_counts=True)
repeat=counts[seams]>1
for k in range(len(names)):
    mean=np.bincount(seams,weights=weights[:,k])/counts
    weights[repeat,k]=mean[seams[repeat]]
keep=np.argpartition(weights,-4,axis=1)[:,-4:]
values=np.take_along_axis(weights,keep,axis=1);values/=values.sum(axis=1,keepdims=True)
order=np.argsort(-values,axis=1);keep=np.take_along_axis(keep,order,axis=1);values=np.take_along_axis(values,order,axis=1)

# One padded coarse displacement field, evaluated with cubic B-splines.
# Compress only the sleeve cap's transverse large form; retain fine folds.
spacing=.025;minimum=np.array([-.9,-.3,-.1]);shape=(73,25,81)
grid=np.stack(np.meshgrid(*[minimum[i]+np.arange(shape[i])*spacing for i in range(3)],indexing='ij'),axis=-1)
field=np.zeros_like(grid)
for side in ['Left','Right']:
    b=bone(side,'Arm');h=np.array(b.head_local);axis=np.array(b.tail_local)-h;axis/=np.linalg.norm(axis)
    delta=grid-h;s=np.einsum('...i,i->...',delta,axis);radial=delta-s[...,None]*axis
    r=np.linalg.norm(radial,axis=-1)
    strength=smooth((s+.045)/.055)*(1-smooth((s-.08)/.07))*(1-smooth((r-.09)/.06))
    # Taper the loose upper sleeve as a whole: the former cap-only fit
    # left a balloon at its distal edge, conspicuous in the left 450-ms view.
    sleeve=smooth((s+.005)/.06)*(1-smooth((s-.16)/.08))*(1-smooth((r-.085)/.065))
    compression=np.maximum(.12*strength,.10*sleeve)
    field-=radial*compression[...,None]
# Smooth displacement samples, not source positions or normals.
for iteration in range(2):
    padded=np.pad(field,((1,1),(1,1),(1,1),(0,0)),mode='constant')
    field=(field*2+padded[:-2,1:-1,1:-1]+padded[2:,1:-1,1:-1]+padded[1:-1,:-2,1:-1]+padded[1:-1,2:,1:-1]+padded[1:-1,1:-1,:-2]+padded[1:-1,1:-1,2:])/8
coordinate=(positions-minimum)/spacing;floors=np.floor(coordinate).astype(int);t=coordinate-floors
basis=np.stack(((1-t)**3,3*t**3-6*t*t+4,-3*t**3+3*t*t+3*t+1,t**3),axis=1)/6
derivative=np.stack((-.5*(1-t)**2,1.5*t*t-2*t,-1.5*t*t+t+.5,.5*t*t),axis=1)/spacing
displacement=np.zeros_like(positions,dtype=np.float64);gradient=np.zeros((len(positions),3,3),np.float64)
for x in range(4):
    for y in range(4):
        for z in range(4):
            offsets=np.array([x,y,z]);indices=np.clip(floors-1+offsets,0,np.array(shape)-1)
            samples=field[indices[:,0],indices[:,1],indices[:,2]]
            factors=[basis[:,x,0],basis[:,y,1],basis[:,z,2]]
            displacement+=samples*np.prod(factors,axis=0)[:,None]
            for axis in range(3):
                factors_d=list(factors);factors_d[axis]=derivative[:,offsets[axis],axis]
                gradient[:,:,axis]+=samples*np.prod(factors_d,axis=0)[:,None]
# Keep the head/neck column exactly fixed, including B-spline support tails.
gate_t=np.clip((np.abs(positions[:,0])-.14)/.035,0,1)
gate=smooth(gate_t);gate_dx=6*gate_t*(1-gate_t)/.035*np.sign(positions[:,0])
gradient*=gate[:,None,None]
gradient[:,:,0]+=displacement*gate_dx[:,None]
displacement*=gate[:,None]
J=gradient+np.eye(3)[None,:,:];det=np.linalg.det(J)
assert det.min()>.7,float(det.min())
normal_matrix=np.linalg.inv(J).transpose(0,2,1)
def fit_normals(attribute):
    raw=acc(j,binary,attrs[attribute]).copy()
    n=raw[:,[0,2,1]].copy();n[:,1]*=-1
    n=np.einsum('nij,nj->ni',normal_matrix,n);n/=np.linalg.norm(n,axis=1,keepdims=True)
    output=n[:,[0,2,1]].copy();output[:,2]*=-1
    active=np.max(np.abs(gradient),axis=(1,2))>1e-12
    output[~active]=raw[~active]
    return output.astype('<f4'),n.astype(np.float32)
normal_output,blender_normals=fit_normals('NORMAL')
outline_output,_=fit_normals('_OUTLINE_NORMAL')
new_positions=source_positions+displacement[:,[0,2,1]]*np.array([1,1,-1])

def add(data,component,kind,bounds=False):
    data=np.asarray(data);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(data.tobytes())
    view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':data.nbytes})
    a={'bufferView':view,'componentType':component,'count':len(data),'type':kind}
    if bounds:a.update(min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist())
    index=len(j['accessors']);j['accessors'].append(a);return index
attrs['POSITION']=add(new_positions.astype('<f4'),5126,'VEC3',True)
attrs['NORMAL']=add(normal_output,5126,'VEC3')
attrs['_OUTLINE_NORMAL']=add(outline_output,5126,'VEC3')
attrs['JOINTS_0']=add(keep.astype('<u2'),5123,'VEC4')
attrs['WEIGHTS_0']=add(values.astype('<f4'),5126,'VEC4')

# Compact only unreferenced buffers/accessors, with exact image/clip bytes.
references=[]
for gm in j['meshes']:
    for primitive in gm['primitives']:
        references.extend((primitive['attributes'],key) for key in primitive['attributes'])
        if 'indices' in primitive:references.append((primitive,'indices'))
        for target in primitive.get('targets',[]):references.extend((target,key) for key in target)
for skin in j['skins']:references.append((skin,'inverseBindMatrices'))
for animation in j.get('animations',[]):
    for sampler in animation['samplers']:references.extend([(sampler,'input'),(sampler,'output')])
used=sorted({container[key] for container,key in references});mapping={old:new for new,old in enumerate(used)}
accessors=[j['accessors'][i] for i in used]
for container,key in references:container[key]=mapping[container[key]]
j['accessors']=accessors
view_refs=[(a,'bufferView') for a in accessors]
assert not any('sparse' in a for a in accessors)
view_refs.extend((im,'bufferView') for im in j.get('images',[]) if 'bufferView' in im)
used_views=sorted({container[key] for container,key in view_refs});view_map={old:new for new,old in enumerate(used_views)}
packed=bytearray();views=[]
for i in used_views:
    v=dict(j['bufferViews'][i]);start=v.get('byteOffset',0);payload=binary[start:start+v['byteLength']]
    packed.extend(b'\0'*(-len(packed)%4));v['byteOffset']=len(packed);v['buffer']=0;packed.extend(payload);views.append(v)
for container,key in view_refs:container[key]=view_map[container[key]]
j['bufferViews']=views;j['buffers']=[{'byteLength':len(packed)}]
j.setdefault('extras',{})['armSurface']={'shoulderCapCompression':.12,'upperSleeveCompression':.10,'elbowBandM':.14,'fieldSpacingM':spacing,'minJacobian':float(det.min()),'weightRegions':regions}
encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);packed.extend(b'\0'*(-len(packed)%4))
result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed
(ROOT/'assets/ninja-anatomical-preview.glb').write_bytes(result)

# Keep the authoring master in sync with the game's derivative.
group_index={i:mesh.vertex_groups[n].index for i,n in enumerate(names)}
bm=bmesh.new();bm.from_mesh(mesh.data);layer=bm.verts.layers.deform.verify()
for v in bm.verts:
    d=v[layer];d.clear()
    for index,value in zip(keep[v.index],values[v.index]):
        if value>1e-7:d[group_index[int(index)]]=float(value)
bm.to_mesh(mesh.data);bm.free()
base_file=ROOT/'out/anatomical-rig/original-positions.npy'
base=np.load(base_file) if base_file.exists() else positions
mesh.data.vertices.foreach_set('co',(base+displacement).astype(np.float32).ravel())
mesh.data.update();mesh.data.normals_split_custom_set_from_vertices(blender_normals.tolist())
mesh['arm_surface_source']=str(SOURCE);mesh['shoulder_cap_compression']=.12
report={'source':str(SOURCE),'outputBytes':len(result),'regions':regions,'maxDisplacementM':float(np.linalg.norm(displacement,axis=1).max()),'minJacobian':float(det.min()),'maxJacobian':float(det.max()),'changedGeometryVertices':int((np.linalg.norm(displacement,axis=1)>1e-7).sum()),'maxWeightSumError':float(np.abs(values.sum(axis=1)-1).max()),'maxInfluences':4}
(OUT/'fit-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
