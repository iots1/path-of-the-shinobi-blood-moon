import numpy as np, json, sys
side=sys.argv[1]
B=json.load(open(f'bones_{side}.json')); pre=f'mixamorig:{side}Hand'
th=np.array(json.load(open(f'thumbtrack_{side}.json')))   # base -> tip
anchor=np.array(B[f'{pre}Thumb1']['head'])                 # CMC of the current rig (at the wrist)
Lr=[np.linalg.norm(np.array(B[f'{pre}Thumb{i+1}']['head'])-np.array(B[f'{pre}Thumb{i}']['head'])) for i in (1,2,3)]
print(side,'rebuilt thumb segments mm',[round(l*1000,1) for l in Lr],'anchor',anchor.round(3))
tip=th[-1]; 
# path: anchor -> track points that are farther from the anchor than the previous ones (drop the wrist-side jitter) -> tip
pts=[anchor]
for p in th:
    if np.linalg.norm(p-anchor)>np.linalg.norm(pts[-1]-anchor)+0.004: pts.append(p)
P=np.array(pts)
c=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]
deg=min(3,len(P)-1); co=[np.polyfit(c,P[:,k],deg) for k in range(3)]
g=np.linspace(0,c[-1],400); Q=np.stack([np.polyval(co[k],g) for k in range(3)],1)
Q[0]=anchor
a=np.r_[0,np.cumsum(np.linalg.norm(np.diff(Q,axis=0),axis=1))]
total=a[-1]-0.008           # H4 sits 8 mm inside the tip
fr=np.cumsum([0]+Lr)/sum(Lr)
at=lambda s: np.array([np.interp(s,a,Q[:,k]) for k in range(3)])
ch=json.load(open(f'chains_{side}.json'))
for i in (1,2,3,4): ch[f'{pre}Thumb{i}']=at(total*fr[i-1]).tolist()
print(side,'thumb chain arc %.3f (rebuilt %.3f)'%(total,sum(Lr)),[np.round(ch[f"{pre}Thumb{i}"],3).tolist() for i in (1,2,3,4)])
json.dump(ch,open(f'chains_{side}.json','w'))
