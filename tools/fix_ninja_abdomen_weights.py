"""Run in Blender via MCP. Patch only GLB joint/weight bytes, preserve all assets.
Removes thigh influence above the pelvis with a smooth vertical falloff.
Imports a separate preview scene for Blender inspection; never overwrites source.
"""
import json, struct, math
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'assets/raw/backup-before-run-body-fix-2026-10-20/ninja.glb'
dst=ROOT/'assets/ninja-bodyfix-v1.glb'
raw=bytearray(src.read_bytes());n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);binbase=20+n+8
p=j['meshes'][0]['primitives'][0]
def accessor(index):
 a=j['accessors'][index];v=j['bufferViews'][a['bufferView']];count={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']];size=struct.calcsize(fmt)*count
 return a,binbase+v.get('byteOffset',0)+a.get('byteOffset',0),v.get('byteStride',size),'<'+fmt*count
pa,pbase,pstride,pfmt=accessor(p['attributes']['POSITION'])
ja,jbase,jstride,jfmt=accessor(p['attributes']['JOINTS_0'])
wa,wbase,wstride,wfmt=accessor(p['attributes']['WEIGHTS_0'])
assert wa['componentType']==5126
names=[j['nodes'][i]['name'].split(':')[-1]for i in j['skins'][0]['joints']]
hips=names.index('Hips');spine=names.index('Spine')
leg={i for i,name in enumerate(names)if any(name.startswith(side+b)for side in ('Left','Right')for b in ('UpLeg','Leg','Foot','Toe'))}
def smooth(x):x=max(0.,min(1.,x));return x*x*(3-2*x)
changed=0;moved=0.;maxRemoved=0.;dropped=0.
for i in range(pa['count']):
 x,y,z=struct.unpack_from(pfmt,raw,pbase+i*pstride)
 # Arm/hand vertices have no leg weight; belt and lower tunic below 1.0 m stay unchanged.
 strength=smooth((y-1.0)/.10)*smooth((.21-abs(x))/.04)
 if strength<=0:continue
 js=struct.unpack_from(jfmt,raw,jbase+i*jstride);ws=struct.unpack_from(wfmt,raw,wbase+i*wstride)
 influences={}
 for idx,w in zip(js,ws):influences[idx]=influences.get(idx,0)+w
 removed=sum(w*strength for idx,w in influences.items()if idx in leg)
 if removed<1e-6:continue
 for idx in list(influences):
  if idx in leg:influences[idx]*=1-strength
 # The lower abdomen follows the pelvis; the upper abdomen blends into the lumbar spine.
 spineShare=smooth((y-1.04)/.12)
 influences[hips]=influences.get(hips,0)+removed*(1-spineShare)
 influences[spine]=influences.get(spine,0)+removed*spineShare
 ordered=sorted(influences.items(),key=lambda a:a[1],reverse=True)
 dropped+=sum(w for _,w in ordered[4:]);ordered=ordered[:4];total=sum(w for _,w in ordered)
 outj=[idx for idx,w in ordered];outw=[w/total for idx,w in ordered]
 while len(outj)<4:outj.append(0);outw.append(0.)
 struct.pack_into(jfmt,raw,jbase+i*jstride,*outj);struct.pack_into(wfmt,raw,wbase+i*wstride,*outw)
 changed+=1;moved+=removed;maxRemoved=max(maxRemoved,removed)
dst.write_bytes(raw)
# Blender independently loads the result for inspection, leaving the user's scene intact.
prior=bpy.context.window.scene
preview=bpy.data.scenes.new('Run Abdomen Weights Preview')
bpy.context.window.scene=preview
bpy.ops.import_scene.gltf(filepath=str(dst))
for obj in preview.objects:
 if obj.type=='ARMATURE':
  obj.animation_data_clear()
  for bone in obj.pose.bones:bone.matrix_basis.identity()
for obj in preview.objects:
 if obj.type=='MESH':
  for poly in obj.data.polygons:poly.use_smooth=True
preview['weight_fix_source']=str(src);preview['weight_fix_output']=str(dst)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender-ninja/run-bodyfix-v1.blend'),copy=True)
bpy.context.window.scene=prior
report={'source':str(src),'output':str(dst),'changed_vertices':changed,'total_vertices':pa['count'],'mean_removed':moved/max(1,changed),'max_removed':maxRemoved,'dropped_total':dropped,'same_file_size':len(raw)==src.stat().st_size,'preview_scene':preview.name}
(ROOT/'out/run-bodyfix-weights.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
