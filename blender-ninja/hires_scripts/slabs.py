import numpy as np, json, sys
side=sys.argv[1]; sg=-1 if side=='Right' else 1
D=np.load(f'hand_{side}.npz'); P=D['P']; head=D['head']; dist=np.load(f'dist_{side}.npy'); R=P-head
SL={'Index':(-0.050,-0.023),'Middle':(-0.023,0.003),'Ring':(0.003,0.0215),'Pinky':(0.0215,0.045)}
xo=sg*R[:,0]
res={}
for f,(y0,y1) in SL.items():
    m=(R[:,1]>=y0)&(R[:,1]<y1)&(xo>0.085)&(dist>0.07)
    X=R[m]; c0=X.mean(0)
    # finger axis: PCA of the points in the slab beyond x_out>0.11 (the free finger)
    mm=m&(xo>0.100); Xf=R[mm]; cf=Xf.mean(0); u,s,vt=np.linalg.svd(Xf-cf,full_matrices=False); d=vt[0]
    if d@np.array([sg,0,-0.3])<0: d=-d
    S=(R@d); smax=S[m].max()
    tr=[]
    for s0 in np.arange(smax,0.03,-0.003):
        k=m&(S>=s0-0.003)&(S<s0)
        if k.sum()<10: continue
        tr.append((R[k].mean(0)+head).tolist()+[int(k.sum())])
    # keep only the free-finger part (x_out>0.105)
    thr={'Index':0.108,'Middle':0.108,'Ring':0.105,'Pinky':0.090}[f]
    tr=[t for t in tr if sg*(t[0]-head[0])>thr]
    L=sum(np.linalg.norm(np.array(tr[i][:3])-np.array(tr[i+1][:3])) for i in range(len(tr)-1))
    print(side,f,'slab n=%d dir=%s smax=%.3f track pts %d length %.3f m  tip %s base %s'%(m.sum(),d.round(2),smax,len(tr),L,np.round(tr[0][:3],3),np.round(tr[-1][:3],3)))
    res[f]=tr
json.dump(res,open(f'slabtracks_{side}.json','w'))
