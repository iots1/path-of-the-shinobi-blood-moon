import numpy as np, json, sys
side=sys.argv[1]
D=np.load(f'hand_{side}.npz'); P=D['P']; head=D['head']; dist=np.load(f'dist_{side}.npy')
R=P-head
tr=json.load(open(f'tracks_{side}.json'))
# distance of every vertex to the four finger tracks (polyline points)
T=np.concatenate([np.array(t)[:,:3] for t in tr])-head
from scipy.spatial import cKDTree
kd=cKDTree(T); dft,_=kd.query(R)
sg=-1 if side=='Right' else 1
m=(dist>0.02)&(dist<0.16)&(dft>0.03)&(R[:,1]<-0.02)
X=R[m]; print('thumb-zone verts',m.sum(),'centroid',X.mean(0).round(3),'min',X.min(0).round(3),'max',X.max(0).round(3))
c0=X.mean(0); u,s,vt=np.linalg.svd(X-c0,full_matrices=False); d=vt[0]
if d@np.array([sg,0,-0.3])<0: d=-d
print('thumb direction',d.round(3),'sv',s.round(2))
S=(X-c0)@d
pts=[]
for s0 in np.arange(S.min(),S.max(),0.004):
    mm=(S>=s0)&(S<s0+0.004)
    if mm.sum()>=15: pts.append((c0+(s0+0.002)*d+((X[mm]-c0)-np.outer(S[mm],d)).mean(0)+head).tolist())
print('thumb track pts',len(pts),'first',np.round(pts[0],3),'last',np.round(pts[-1],3))
json.dump(pts,open(f'thumbtrack_{side}.json','w'))
