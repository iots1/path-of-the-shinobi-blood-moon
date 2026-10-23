import numpy as np, json, sys
from scipy.cluster.vq import kmeans2
side=sys.argv[1]
D=np.load(f'hand_{side}.npz'); P=D['P']; head=D['head']; dist=np.load(f'dist_{side}.npy')
R=P-head
zone=dist>0.095
X=R[zone]; c0=X.mean(0)
u,s,vt=np.linalg.svd(X-c0,full_matrices=False); d=vt[0]
if d@np.array([-1,0,0.])*(1 if side=='Right' else -1) < 0: d=-d
print('finger direction',d.round(3),'singular',s.round(3),'centroid',c0.round(3))
# plane basis
tmp=np.array([0,1.,0]); e1=np.cross(d,tmp); e1/=np.linalg.norm(e1); e2=np.cross(d,e1)
S=(R@d); W1=R@e1; W2=R@e2
sel=dist>0.07
smin,smax=S[sel].min(),S[sel].max(); print('s range',round(smin,3),round(smax,3))
# tip region: top 22% of s
tipm=sel&(S>smax-0.035)
pts=np.stack([W1[tipm],W2[tipm]],1)
for k in (4,5):
    cen,lab=kmeans2(pts,k,minit='++',seed=3)
    print(' k=%d tip-region centres (w1,w2) mm:'%k,(cen*1000).round(0).tolist(),'counts',np.bincount(lab).tolist())

# ---- track the 4 fingers from the tips back toward the palm
cen4,lab4=kmeans2(pts,4,minit='++',seed=3)
order=np.argsort(cen4[:,0])[::-1]; cen4=cen4[order]    # index finger first (largest w1)
tr=[[] for _ in range(4)]; cur=cen4.copy()
step=0.003
for s0 in np.arange(smax,0.06,-step):
    m=sel&(S>=s0-step)&(S<s0)
    if m.sum()<30: continue
    q=np.stack([W1[m],W2[m]],1)
    dd=np.linalg.norm(q[:,None,:]-cur[None],axis=2); a=dd.argmin(1); ok=dd.min(1)<0.016
    for f in range(4):
        mm=ok&(a==f)
        if mm.sum()>=12:
            cur[f]=0.5*cur[f]+0.5*q[mm].mean(0)
            p3=head+(s0-step/2)*d+cur[f][0]*e1+cur[f][1]*e2
            tr[f].append(p3.tolist()+[float(mm.sum())])
for f in range(4):
    t=np.array(tr[f]); print('finger',f,'slices',len(t),'tip',t[0][:3] if len(t) else None,'base',t[-1][:3] if len(t) else None)
json.dump(tr,open(f'tracks_{side}.json','w'))
