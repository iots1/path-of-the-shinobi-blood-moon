import sys, json, struct, io, numpy as np
from PIL import Image
raw='/Users/PEEPO/Project/game/blender-ninja/new_ninja_no_hood/Meshy_AI_Unmasked_Male_Ninja_T_1019103458_image-to-3d-texture.glb'
exec(open('tools/graft_hires.py').read().split("orig_p, raw_p")[0].split('"""',2)[2])
j,b=load(raw); pr=j['meshes'][0]['primitives'][0]
P=acc(j,b,pr['attributes']['POSITION']).astype(np.float64); UV=acc(j,b,pr['attributes']['TEXCOORD_0']).astype(np.float64)
s=1.75/(P[:,1].max()-P[:,1].min()); P=P*s; P[:,1]-=P[:,1].min()
# blender coords: (x, -z_gl, y_gl)
B=np.stack([P[:,0],-P[:,2],P[:,1]],1)
head=np.array([-0.621,0.0303,1.3415]); ax=np.array([-0.992,-0.125,-0.021])
d=B-head; u=d@ax; r=np.linalg.norm(d-np.outer(u,ax),axis=1)
side=(B[:,0]<-0.5)&(r<0.09)
def img(i):
    bv=j['bufferViews'][j['images'][i]['bufferView']]; o=bv.get('byteOffset',0)
    return Image.open(io.BytesIO(b[o:o+bv['byteLength']])).convert('RGB')
base,mr,nrm=img(0),img(1),img(2)
print('sizes', base.size, mr.size, nrm.size)
def med(mask, im):
    w,h=im.size; a=np.asarray(im)
    x=np.clip((UV[mask,0]*w).astype(int),0,w-1); y=np.clip((UV[mask,1]*h).astype(int),0,h-1)
    c=a[y,x].astype(float); return np.median(c,0).round().astype(int).tolist(), c.mean(0).round().astype(int).tolist(), int(mask.sum())
groups={'skin_fingers':side&(u>0.13)&(r<0.04), 'glove_band':side&(u>0.05)&(u<0.095)&(r>0.04), 'wrist':side&(np.abs(u)<0.02)}
out={}
for k,m in groups.items():
    out[k]={'base':med(m,base),'mr':med(m,mr),'nrm':med(m,nrm)}
    print(k, out[k])
json.dump({k:{'base':v['base'][0],'mr':v['mr'][0]} for k,v in out.items()}, open(sys.argv[1]+'/hand_colors.json','w'))
