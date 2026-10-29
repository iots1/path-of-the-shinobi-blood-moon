"""Run in Blender: same-pose elbow compression audit against this pass's backup."""
from pathlib import Path
import json,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
ns={'__file__':str(ROOT/'tools/check_arm_surface.py')}
exec(compile((ROOT/'tools/check_arm_surface.py').read_text(),ns['__file__'],'exec'),ns)
load,acc,deform=ns['load'],ns['acc'],ns['deform']
old,b0=load(ROOT/'blender-ninja/backups/before-elbow-corrective-20261026/ninja-anatomical-preview.glb')
new,b1=load(ROOT/'assets/ninja-anatomical-preview.glb')
a0=old['meshes'][0]['primitives'][0]['attributes'];a1=new['meshes'][0]['primitives'][0]['attributes']
p0=acc(old,b0,a0['POSITION']);p1=acc(new,b1,a1['POSITION'])
ids0=acc(old,b0,a0['JOINTS_0']);ids1=acc(new,b1,a1['JOINTS_0']);w0=acc(old,b0,a0['WEIGHTS_0']);w1=acc(new,b1,a1['WEIGHTS_0'])
names=[new['nodes'][i]['name'].split(':')[-1] for i in new['skins'][0]['joints']]
ibms=acc(new,b1,new['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
def profile(p,target):
    result=np.ones(len(p))
    for i,n in enumerate(names):
        if n not in ['LeftArm','RightArm','LeftForeArm','RightForeArm']:continue
        elbow=n.endswith('ForeArm');core=.045 if elbow else .075;radius=.10 if elbow else .16;amount=target if elbow else .18
        h=np.linalg.inv(ibms[i])[:3,3];mask=1-ns['smooth']((np.linalg.norm(p-h,axis=1)-core)/(radius-core));result=np.minimum(result,1-mask*(1-amount))
    return result
blends=[profile(p0,.35),profile(p1,.75)]
all_edges=ns['edges'];report={'preservation':ns['checks'],'poses':[]}
for pose in json.loads((ROOT/'out/sleeve-after.json').read_text())['records']:
    record={'mode':pose['mode'],'time':pose['time'],'sides':{},'supportElbow':pose.get('supportElbow')}
    for side in ['Left','Right']:
        head=np.linalg.inv(ibms[names.index(side+'ForeArm')])[:3,3]
        selected=np.linalg.norm(p1-head,axis=1)<.13
        edges=all_edges[selected[all_edges].all(axis=1)]
        values={}
        for label,p,ids,w,blend in zip(['before','after'],[p0,p1],[ids0,ids1],[w0,w1],blends):
            posed=deform(p,ids,w,pose,blend,True);rest=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);valid=rest>.001
            ratio=np.linalg.norm(posed[edges[:,0]]-posed[edges[:,1]],axis=1)[valid]/rest[valid]
            assert np.isfinite(posed).all()
            values[label]={'compressionP01':float(np.percentile(ratio,1)),'stretchP99':float(np.percentile(ratio,99)),'compressedBelowHalfFraction':float((ratio<.5).mean())}
        record['sides'][side]=values
    report['poses'].append(record)
(ROOT/'out/elbow-shoulder/sleeve-validation.json').write_text(json.dumps(report,indent=2))
print('Sleeve audit saved',json.dumps(report['poses'],indent=2))
