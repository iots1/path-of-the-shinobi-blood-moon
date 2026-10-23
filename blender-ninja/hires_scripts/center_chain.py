import numpy as np, json, sys
side=sys.argv[1]; iters=int(sys.argv[2]) if len(sys.argv)>2 else 4
D=np.load(f'hand_{side}.npz'); P=D['P']
pre=f'mixamorig:{side}Hand'
ch=json.load(open(f'chains_{side}.json'))
FING=['Pinky','Ring','Middle','Index','Thumb']
J={f:np.array([ch[f'{pre}{f}{i}'] for i in (1,2,3,4)]) for f in FING}
def segd(Q,A,B):
    ab=B-A; t=np.clip(((Q-A)@ab)/(ab@ab),0,1); return np.linalg.norm(Q-(A+t[:,None]*ab),axis=1)
for it in range(iters):
    # assign every vertex to the nearest finger chain
    dd=np.stack([np.min([segd(P,J[f][i],J[f][i+1]) for i in range(3)],axis=0) for f in FING],1)
    own=dd.argmin(1)
    for fi,f in enumerate(FING):
        j=J[f].copy()
        for k in range(4):
            if k==0: t=j[1]-j[0]
            elif k==3: t=j[3]-j[2]
            else: t=j[k+1]-j[k-1]
            t=t/np.linalg.norm(t)
            rel=P-j[k]; al=rel@t
            m=(own==fi)&(np.abs(al)<0.003)&(np.linalg.norm(rel,axis=1)<0.014)
            if m.sum()<12: continue
            perp=rel[m]-np.outer(al[m],t)
            step=0.7*perp.mean(0); n=np.linalg.norm(step)
            if n>0.004: step*=0.004/n
            j[k]=j[k]+step
        J[f]=j
for f in FING:
    for i in (1,2,3,4): ch[f'{pre}{f}{i}']=J[f][i-1].tolist()
json.dump(ch,open(f'chains2_{side}.json','w'))
print('centred',side)
