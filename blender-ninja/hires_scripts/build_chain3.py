import numpy as np, json, sys
side=sys.argv[1]
B=json.load(open(f'bones_{side}.json')); pre=f'mixamorig:{side}Hand'
tr=json.load(open(f'slabtracks_{side}.json')); ch=json.load(open(f'chains_{side}.json')) if False else {}
th=json.load(open(f'chains2_{side}.json'))   # thumb from the earlier pass (kept)
def L(n,i): return np.linalg.norm(np.array(B[f'{pre}{n}{i+1}']['head'])-np.array(B[f'{pre}{n}{i}']['head']))
def smooth(pts,tmax):
    p=np.array(pts)[:,:3]; c=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    m=c<=tmax; deg=min(3,m.sum()-1); co=[np.polyfit(c[m],p[m,k],deg) for k in range(3)]
    g=np.linspace(0,c[-1]+0.10,700); q=np.stack([np.polyval(co[k],g) for k in range(3)],1)
    i=min(np.searchsorted(g,min(tmax,c[-1])),len(g)-6); tang=q[i]-q[i-5]; tang/=np.linalg.norm(tang)
    q[i:]=q[i]+np.outer(g[i:]-g[i],tang)
    a=np.r_[0,np.cumsum(np.linalg.norm(np.diff(q,axis=0),axis=1))]; return a,q,c[-1]
out={}
for f in ('Index','Middle','Ring','Pinky'):
    pts=tr[f]
    a,q,Ltr=smooth(pts,0.2)
    tot=sum(L(f,i) for i in (1,2,3))
    s4=0.008
    Kf=0.9
    s3=s4+Kf*L(f,3); s2=s3+Kf*L(f,2); s1=s2+Kf*L(f,1)
    at=lambda s: np.array([np.interp(s,a,q[:,k]) for k in range(3)])
    for i,s in zip((4,3,2,1),(s4,s3,s2,s1)): out[f'{pre}{f}{i}']=at(s).tolist()
    print(side,f,'free-finger track %.3f m  K=%.2f  MCP at arc %.3f'%(Ltr,Kf,s1))
for i in (1,2,3,4): out[f'{pre}Thumb{i}']=th[f'{pre}Thumb{i}']
json.dump(out,open(f'chains_{side}.json','w'))
