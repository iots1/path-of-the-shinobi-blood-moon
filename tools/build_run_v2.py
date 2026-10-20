"""Run in Blender via MCP. Build a mesh-free RunningV2 clip from the current rig.
Keeps the source rig and cyclic timing; adds knee drive and heel recovery.
The torso, sword and arms remain driven by the game's IK system.
"""
import json, struct
from pathlib import Path
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'assets/ninja.glb'
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + size])
off = 20 + size
blob = raw[off + 8:]
run = next(a for a in gltf['animations'] if a['name'] == 'Running')
nodes = [{k:v for k,v in n.items() if k not in ('mesh','skin','camera')} for n in gltf['nodes']]
out = {'asset':{'version':'2.0','generator':'Shinobi RunningV2 / Blender mathutils'},
       'scene':0,'scenes':gltf['scenes'],'nodes':nodes,'accessors':[], 'bufferViews':[],
       'animations':[{'name':'RunningV2','samplers':[],'channels':[]}]}
binary = bytearray()
def read(index):
 a=gltf['accessors'][index]; v=gltf['bufferViews'][a['bufferView']]
 count={'SCALAR':1,'VEC4':4}[a['type']]; stride=v.get('byteStride',count*4)
 start=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+'f'*count,blob,start+i*stride) for i in range(a['count'])]
def append(values,typ):
 while len(binary)%4: binary.append(0)
 offset=len(binary)
 for v in values: binary.extend(struct.pack('<'+'f'*len(v),*v))
 vi=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset})
 a={'bufferView':vi,'componentType':5126,'count':len(values),'type':typ}
 if typ=='SCALAR':a.update(min=[min(v[0] for v in values)],max=[max(v[0] for v in values)])
 ai=len(out['accessors']);out['accessors'].append(a);return ai
selected=[]
for ch in run['channels']:
 target=ch['target']; node=nodes[target['node']]; name=node.get('name','').split(':')[-1]
 if name not in [s+b for s in ('Left','Right') for b in ('UpLeg','Leg','Foot','ToeBase')] or target['path']!='rotation':continue
 sampler=run['samplers'][ch['sampler']];times=read(sampler['input']); values=read(sampler['output'])
 factor=1.12 if name.endswith('UpLeg') else 1.10 if name.endswith('Leg') else 1.0
 rest=node.get('rotation',[0,0,0,1]);bind=Quaternion((rest[3],*rest[:3])); adjusted=[]
 for v in values:
  q=Quaternion((v[3],*v[:3])); delta=bind.rotation_difference(q);axis,angle=delta.to_axis_angle()
  if angle>3.141592653589793:angle-=6.283185307179586
  result=bind@Quaternion(axis,angle*factor);result.normalize()
  adjusted.append((result.x,result.y,result.z,result.w))
 si=len(out['animations'][0]['samplers'])
 out['animations'][0]['samplers'].append({'input':append(times,'SCALAR'),'output':append(adjusted,'VEC4'),'interpolation':'LINEAR'})
 out['animations'][0]['channels'].append({'sampler':si,'target':target});selected.append(name)
assert len(selected)==8,selected
out['buffers']=[{'byteLength':len(binary)}]
js=json.dumps(out,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
data=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
path=ROOT/'assets/anim/run-v2.glb';path.parent.mkdir(exist_ok=True);path.write_bytes(data)
print(json.dumps({'output':str(path),'bytes':len(data),'tracks':selected,'source':'assets/ninja.glb:Running','thighGain':1.12,'kneeGain':1.10}))
