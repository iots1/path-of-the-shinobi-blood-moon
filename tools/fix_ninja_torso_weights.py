"""Patch torso skin weights, preserving topology, textures and animations.
Run in Blender. Uses backed-up v1, writes a candidate; never overwrites the backup.
"""
import json,struct
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'assets/raw/backup-before-rig-detail-2026-10-20/ninja.glb'
dst=ROOT/'assets/ninja-bodyfix-v2.glb'
raw=bytearray(src.read_bytes());n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);base=20+n+8
attrs=j['meshes'][0]['primitives'][0]['attributes']
def acc(name):
 a=j['accessors'][attrs[name]];v=j['bufferViews'][a['bufferView']];fmt='<'+{5126:'f',5123:'H',5121:'B'}[a['componentType']]*{'VEC3':3,'VEC4':4}[a['type']]
 return a,base+v.get('byteOffset',0)+a.get('byteOffset',0),v.get('byteStride',struct.calcsize(fmt)),fmt
pa,pb,ps,pf=acc('POSITION');ja,jb,js,jf=acc('JOINTS_0');wa,wb,ws,wf=acc('WEIGHTS_0')
names=[j['nodes'][i]['name'].split(':')[-1]for i in j['skins'][0]['joints']]
def sm(x):x=max(0,min(1,x));return x*x*(3-2*x)
centres=[('Hips',.99808),('Spine',1.11581),('Spine1',1.23355),('Spine2',1.35485),('Neck',1.437),('Head',1.507)]
changed=0
for i in range(pa['count']):
 x,y,z=struct.unpack_from(pf,raw,pb+i*ps)
 # Full influence in the central trunk, feather into shoulder/arm skin.
 width=.13 if y<1.41 else .13-.055*sm((y-1.41)/.07)
 strength=sm((y-.95)/.065)*sm((1.53-y)/.055)*(1-sm((abs(x)-width)/.075))
 if strength<1e-6:continue
 target={}
 for k in range(len(centres)-1):
  (lo,yl),(hi,yh)=centres[k:k+2]
  if yl<=y<=yh:
   t=sm((y-yl)/(yh-yl));target={names.index(lo):1-t,names.index(hi):t};break
 if not target:target={names.index('Hips'if y<centres[0][1]else'Head'):1.}
 ids=struct.unpack_from(jf,raw,jb+i*js);weights=struct.unpack_from(wf,raw,wb+i*ws);out={}
 for idx,w in zip(ids,weights):out[idx]=out.get(idx,0)+w*(1-strength)
 for idx,w in target.items():out[idx]=out.get(idx,0)+w*strength
 pairs=sorted(out.items(),key=lambda p:p[1],reverse=True)[:4];total=sum(w for _,w in pairs)
 oi=[idx for idx,w in pairs];ow=[w/total for idx,w in pairs]
 while len(oi)<4:oi.append(0);ow.append(0.)
 struct.pack_into(jf,raw,jb+i*js,*oi);struct.pack_into(wf,raw,wb+i*ws,*ow);changed+=1
# Remove cross-leg influence on separated thigh/shin skin. Keep the crotch feathered.
leg_changed=0
for i in range(pa['count']):
 x,y,z=struct.unpack_from(pf,raw,pb+i*ps)
 if y>=.96 or abs(x)<.015:continue
 own='Left' if x>0 else 'Right';other='Right' if own=='Left' else 'Left'
 ids=struct.unpack_from(jf,raw,jb+i*js);weights=struct.unpack_from(wf,raw,wb+i*ws)
 own_weight=sum(w for idx,w in zip(ids,weights)if names[idx].startswith(own) and any(part in names[idx]for part in ('UpLeg','Leg','Foot','Toe')))
 if own_weight<.6:continue
 strength=sm((abs(x)-.015)/.06)*sm((.96-y)/.14)
 out={};removed=0
 for idx,w in zip(ids,weights):
  if names[idx].startswith(other) and any(part in names[idx]for part in ('UpLeg','Leg','Foot','Toe')):removed+=w*strength;w*=1-strength
  out[idx]=out.get(idx,0)+w
 if removed<1e-6:continue
 idx=names.index(own+'UpLeg');out[idx]=out.get(idx,0)+removed
 pairs=sorted(out.items(),key=lambda p:p[1],reverse=True)[:4];total=sum(w for _,w in pairs);oi=[idx for idx,w in pairs];ow=[w/total for idx,w in pairs]
 while len(oi)<4:oi.append(0);ow.append(0.)
 struct.pack_into(jf,raw,jb+i*js,*oi);struct.pack_into(wf,raw,wb+i*ws,*ow);leg_changed+=1
dst.write_bytes(raw)
print(json.dumps({'source':str(src),'candidate':str(dst),'torso_vertices':changed,'cross_leg_vertices':leg_changed,'unchanged_geometry':True}))
