import sys, json, struct, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
raw='/Users/PEEPO/Project/game/blender-ninja/new_ninja_no_hood/Meshy_AI_Unmasked_Male_Ninja_T_1019103458_image-to-3d-texture.glb'
exec(open('tools/graft_hires.py').read().split("orig_p, raw_p")[0].split('"""',2)[2])  # load/acc helpers
j,b=load(raw); pr=j['meshes'][0]['primitives'][0]
UV=acc(j,b,pr['attributes']['TEXCOORD_0']).astype(np.float64); T=acc(j,b,pr['indices']).astype(np.int64).reshape(-1,3)
print('uv range', UV.min(0), UV.max(0))
R=2048
im=Image.new('L',(R,R),0); d=ImageDraw.Draw(im)
tri=UV[T]*R   # (n,3,2) glTF convention: v from top
for t in tri: d.polygon([tuple(p) for p in t], fill=255)
m=np.array(im)>0
print('covered fraction', m.mean())
dist=ndimage.distance_transform_edt(~m)
np.save(sys.argv[1]+'/uv_dist2048.npy', dist.astype(np.float32))
# best free discs (greedy, non-overlapping)
found=[]
dd=dist.copy()
for k in range(6):
    i=np.unravel_index(np.argmax(dd), dd.shape); r=dd[i]
    found.append((int(i[1]*2), int(i[0]*2), float(r*2)))   # x px, y px (from top) at 4096, radius px at 4096
    yy,xx=np.ogrid[:R,:R]; dd[(yy-i[0])**2+(xx-i[1])**2 < (r+2)**2]=0
print('free discs (x,y_from_top,radius) @4096:', found)
