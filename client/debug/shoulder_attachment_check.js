import * as THREE from 'three';
import {views,armAngles} from './motion_check.js';
export async function shoulderAttachmentCheck(tag='after'){
 const I=window.__iso;while(!I?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
 const R=I.rig.real;let skin=R.skinning.mesh;if(!skin)throw new Error('Rendered body not found');const geo=skin.geometry,pos=geo.attributes.position;
 const bi=skin.skeleton.bones.findIndex(b=>/LeftArm$/.test(b.name)),center=new THREE.Vector3().setFromMatrixPosition(skin.skeleton.boneInverses[bi].clone().invert()),near=new Set();
 for(let i=0;i<pos.count;i++)if(new THREE.Vector3().fromBufferAttribute(pos,i).distanceTo(center)<.11)near.add(i);
 const edges=new Map(),ids=geo.index?.array;
 if(!ids)throw new Error('Indexed source mesh required');
 for(let i=0;i<ids.length;i+=3)for(const [u,v] of [[ids[i],ids[i+1]],[ids[i+1],ids[i+2]],[ids[i+2],ids[i]]]){
  if(!near.has(u)||!near.has(v))continue;const key=u<v?`${u}:${v}`:`${v}:${u}`;
  const length=new THREE.Vector3().fromBufferAttribute(pos,u).distanceTo(new THREE.Vector3().fromBufferAttribute(pos,v));
  if(length>.001)edges.set(key,{u,v,length});
 }
 const rows=[];
 for(const time of [700,840,940,1000,1180,1400,1750,1950]){
  await views({mode:'dual',times:[time],angles:['front'],save:false,captureFrames:false});R.skinning.update();
  const sample=new Map([...near].map(i=>[i,R.skinning.getVertexPosition(i,new THREE.Vector3())]));
  const ratios=[...edges.values()].map(({u,v,length})=>sample.get(u).distanceTo(sample.get(v))/length).sort((a,b)=>a-b);
  const a=R.arm.L,back=R.backSwords[0].g,hq=a.ha.getWorldQuaternion(new THREE.Quaternion()),palm=a.ha.getWorldPosition(new THREE.Vector3()).add(R.grip.L.pt.clone().applyQuaternion(hq));

  rows.push({unsupportedScale:R.skinning.unsupportedScale,skinningEnabled:R.skinning.enabled,time,attackTime:I.S.act?.t,attachment:a.shoulderAttachment,evaluation:a.gripEvaluation,controls:a.clavicleAngles,angles:armAngles('L'),grip:a.gripSolution,palmGapM:palm.distanceTo(new THREE.Vector3(0,.0835,0).applyQuaternion(back.quaternion).add(back.position)),surface:{vertices:near.size,edges:edges.size,p01:ratios[Math.floor(ratios.length*.01)],p95:ratios[Math.floor(ratios.length*.95)],max:ratios.at(-1)}});
 }
 const report={revision:I.runtimeRevision,tag,rows,shaderErrors:I.shaderErrors};await fetch('/debug/save?name=shoulder-attachment-'+tag+'.json',{method:'POST',body:JSON.stringify(report,null,2)});return JSON.stringify(report);
}
