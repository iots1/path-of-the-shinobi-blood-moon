import * as THREE from 'three';
import {shoulderTrace,armAngles} from './motion_check.js';
export async function jReturnCheck(tag='before'){
 while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));const I=window.__iso,R=I.rig.real,reports=[];
 const restore=tag==='before'?disableRestReturn(I):()=>{};
 try{
 for(const [name,presses] of [['single',[600]],['two',[600,1020]],['combo',[600,1020,1460]],['repeat',[600,3000,5400]]]){
  const frames=[],previous={};let baseline;
  await shoulderTrace({until:10000,runMs:0,presses,onSample(t){
   const inv=I.rig.chest.getWorldQuaternion(new THREE.Quaternion()).invert(),arms={};
   for(const side of ['L','R']){const a=R.arm[side],sh=a.up.getWorldPosition(new THREE.Vector3()),el=a.fo.getWorldPosition(new THREE.Vector3()),wr=a.ha.getWorldPosition(new THREE.Vector3()),u=el.clone().sub(sh).normalize(),f=wr.clone().sub(el).normalize();
    const elbow=el.clone().sub(sh).applyQuaternion(inv),wristQ=a.ha.quaternion.clone().normalize(),prior=previous[side];
    arms[side]={upperQ:inv.clone().multiply(a.up.getWorldQuaternion(new THREE.Quaternion())).normalize().toArray(),elbow:elbow.toArray(),wrist:wr.clone().sub(sh).applyQuaternion(inv).toArray(),interior:sh.clone().sub(el).angleTo(wr.clone().sub(el))*180/Math.PI,bendForward:f.addScaledVector(u,-f.dot(u)).applyQuaternion(inv).z,angles:armAngles(side),wristRate:prior?prior.q.angleTo(wristQ)*180/Math.PI/.004:0,elbowSpeed:prior?prior.elbow.distanceTo(elbow)/.004:0,restRoll:a.upperRollRest,roll:a.upperRoll,maxGripReach:a.gLenMax};
    previous[side]={q:wristQ,elbow};
   }
   if(t===400)baseline=arms;frames.push({t,action:I.S.act?.t??null,twoEff:I.S.twoEff,returnWeight:R.restReturn?.weight??0,supportPlane:R.supportElbow.last?.angleDegrees,arms});
  }});
  const late=frames.filter(f=>f.t>=9000),lateDeviation={};
  for(const side of ['L','R'])lateDeviation[side]=Math.max(...late.map(f=>new THREE.Quaternion().fromArray(baseline[side].upperQ).angleTo(new THREE.Quaternion().fromArray(f.arms[side].upperQ))*180/Math.PI));
  reports.push({name,baseline,lateDeviation,frames});
 }
 }finally{restore();}
 const result={revision:I.runtimeRevision,stepMs:4,reports,shaderErrors:I.shaderErrors};await fetch('/debug/save?name=j-return-'+tag+'.json',{method:'POST',body:JSON.stringify(result)});return JSON.stringify({...result,reports:reports.map(({frames,...r})=>r)},null,2);
}
export function disableRestReturn(I){
 const rest=I.rig.real.restReturn;if(!rest)return ()=>{};
 const update=rest.update;rest.update=(...args)=>{update(...args);rest.weight=0;rest.active=false;};
 return ()=>{rest.update=update;};
}
