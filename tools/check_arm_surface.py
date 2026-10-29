"""Blender/NumPy: source preservation and actual game-palette deformation audit."""
import bpy,sys,json,hashlib
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from glb_io import load,acc
before,b0=load(ROOT/'blender-ninja/backups/before-elbow-shoulder-20261026-195339/ninja-anatomical-preview.glb')
after,b1=load(ROOT/'assets/ninja-anatomical-preview.glb')
a0=before['meshes'][0]['primitives'][0]['attributes'];a1=after['meshes'][0]['primitives'][0]['attributes']
checks={}
for name in ['TEXCOORD_0']:
    checks[name+'Identical']=bool(np.array_equal(acc(before,b0,a0[name]),acc(after,b1,a1[name])))
indices0=acc(before,b0,before['meshes'][0]['primitives'][0]['indices']);indices1=acc(after,b1,after['meshes'][0]['primitives'][0]['indices'])
checks['topologyIdentical']=bool(np.array_equal(indices0,indices1))
checks['nodesAndBindHierarchyIdentical']=before['nodes']==after['nodes']
checks['materialsIdentical']=before['materials']==after['materials']
checks['inverseBindIdentical']=bool(np.array_equal(acc(before,b0,before['skins'][0]['inverseBindMatrices']),acc(after,b1,after['skins'][0]['inverseBindMatrices'])))
checks['imagesIdentical']=True
for old,new in zip(before['images'],after['images']):
    v=before['bufferViews'][old['bufferView']];w=after['bufferViews'][new['bufferView']]
    checks['imagesIdentical'] &= b0[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]==b1[w.get('byteOffset',0):w.get('byteOffset',0)+w['byteLength']]
checks['allAnimationSamplesIdentical']=True
for old,new in zip(before['animations'],after['animations']):
    checks['allAnimationSamplesIdentical'] &= old['name']==new['name'] and old['channels']==new['channels']
    for u,v in zip(old['samplers'],new['samplers']):
        for key in ['input','output']:checks['allAnimationSamplesIdentical'] &= bool(np.array_equal(acc(before,b0,u[key]),acc(after,b1,v[key])))
p0=acc(before,b0,a0['POSITION']);p1=acc(after,b1,a1['POSITION']);ids0=acc(before,b0,a0['JOINTS_0']);ids1=acc(after,b1,a1['JOINTS_0']);w0=acc(before,b0,a0['WEIGHTS_0']);w1=acc(after,b1,a1['WEIGHTS_0'])
names=[after['nodes'][i]['name'] for i in after['skins'][0]['joints']]
protected_bones=np.array([('Hand' in n or 'Head' in n or 'Leg' in n or 'Foot' in n or 'Toe' in n) for n in names])
protected=(protected_bones[ids0]*w0).sum(axis=1)>.5
checks['handsHeadLegPositionsIdentical']=bool(np.array_equal(p0[protected],p1[protected]))
checks['finiteNormalsAndWeights']=bool(np.isfinite(acc(after,b1,a1['NORMAL'])).all() and np.isfinite(w1).all())
checks['normalizedFourWeights']=bool(np.max(np.abs(w1.sum(axis=1)-1))<1e-6)
assert all(checks.values()),checks

report={'preservation':checks,'poses':[]}
snapshot=json.loads((ROOT/'out/elbow-surface-after.json').read_text())
edges=np.unique(np.sort(np.concatenate([indices1.reshape(-1,3)[:,[0,1]],indices1.reshape(-1,3)[:,[1,2]],indices1.reshape(-1,3)[:,[2,0]]]),axis=1),axis=0)
arm=np.array([('Arm' in n or 'Shoulder' in n) for n in names])
eligible=(arm[ids1]*w1).sum(axis=1)>.25
edge_mask=eligible[edges[:,0]] & eligible[edges[:,1]]
edges=edges[edge_mask]
def smooth(x):
    t=np.clip(x,0,1);return t*t*(3-2*t)
profile=np.ones(len(p1))
ibms=acc(after,b1,after['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
for i,n in enumerate(names):
    if n.split(':')[-1] not in ['LeftArm','RightArm','LeftForeArm','RightForeArm']:continue
    elbow=n.endswith('ForeArm');core=.045 if elbow else .075;radius=.10 if elbow else .16;target=.75 if elbow else .18
    head=np.linalg.inv(ibms[i])[:3,3];mask=1-smooth((np.linalg.norm(p1-head,axis=1)-core)/(radius-core));profile=np.minimum(profile,1-mask*(1-target))
def deform(p,ids,weights,pose,profile,dominant=False):
    bind=np.array(pose['bind']).reshape(4,4).T;inv=np.array(pose['bindInverse']).reshape(4,4).T
    point=np.column_stack((p,np.ones(len(p))))@bind.T
    matrices=np.array(pose['matrices']).reshape(-1,4,4).transpose(0,2,1)
    linear=np.zeros((len(p),4));qr=np.array(pose['dqReal']).reshape(-1,4);qd=np.array(pose['dqDual']).reshape(-1,4)
    r=np.zeros((len(p),4));d=np.zeros_like(r)
    reference=qr[ids[np.arange(len(ids)),np.argmax(weights,axis=1)]] if dominant else qr[ids[:,0]]
    for slot in range(4):
        linear+=np.einsum('nij,nj->ni',matrices[ids[:,slot]],point)*weights[:,slot,None]
        sign=np.where((reference*qr[ids[:,slot]]).sum(axis=1)<0,-1,1);weight=weights[:,slot]*sign
        r+=qr[ids[:,slot]]*weight[:,None];d+=qd[ids[:,slot]]*weight[:,None]
    norm=np.linalg.norm(r,axis=1);r/=norm[:,None];d/=norm[:,None];d-=r*(r*d).sum(axis=1)[:,None]
    rotation=point[:,:3]+2*np.cross(r[:,:3],np.cross(r[:,:3],point[:,:3])+r[:,3,None]*point[:,:3])
    translation=2*(r[:,3,None]*d[:,:3]-d[:,3,None]*r[:,:3]+np.cross(r[:,:3],d[:,:3]))
    posed=linear[:,:3]*(1-profile[:,None])+(rotation+translation)*profile[:,None]
    return (np.column_stack((posed,np.ones(len(p))))@inv.T)[:,:3]
for pose in snapshot['data']:
    row={'mode':pose['mode'],'time':pose['time']}
    for label,p,ids,w,blend in [('before',p0,ids0,w0,np.ones(len(p0))),('after',p1,ids1,w1,profile)]:
        posed=deform(p,ids,w,pose,blend,dominant=label=='after');base=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);valid=base>.001
        ratio=np.linalg.norm(posed[edges[:,0]]-posed[edges[:,1]],axis=1)[valid]/base[valid]
        row[label]={'edgeStretchP99':float(np.percentile(ratio,99)),'edgeStretchMax':float(ratio.max()),'finite':bool(np.isfinite(posed).all())}
    report['poses'].append(row)
assert all(x['after']['finite'] for x in report['poses'])
(ROOT/'out/elbow-shoulder/validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
