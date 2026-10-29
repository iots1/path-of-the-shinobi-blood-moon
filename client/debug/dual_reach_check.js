import * as THREE from 'three';
import {views,armAngles} from './motion_check.js';
import {naturalUpperTwistDegrees,upperControlAngles,foreControlAngles,hingeErrorDegrees} from '../rig/hinge_frame.js';
export async function dualReachCheck(tag='before'){
 while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));const I=window.__iso;
 while([I.rig.real.equipmentCloak,I.rig.real.equipmentMask].some(x=>x?.status==='loading'))await new Promise(r=>setTimeout(r,100));
 I.stop();const saved={...I.EQUIPMENT},back=I.BACK_GEAR.visible;I.setCloak(false);I.setMask(false);I.setBackGearVisible(false);
 const frame=I.frame,trace=[];let previous=null;
 const hinge=side=>{const a=I.rig.real.arm[side];return hingeErrorDegrees(a,a.up.getWorldPosition(new THREE.Vector3()),a.fo.getWorldPosition(new THREE.Vector3()),a.ha.getWorldPosition(new THREE.Vector3()));};
 I.frame=(...args)=>{frame(...args);if(args[1]>0&&I.S.act?.def===I.DUAL){const t=I.S.act.t;if(Math.round(t)%4===0){const a=I.rig.real.arm.L;trace.push({t,angles:armAngles('L'),upperControl:upperControlAngles(a),foreControl:foreControlAngles(a),hinge:hinge('L'),upperTwist:naturalUpperTwistDegrees(a,a.up.getWorldPosition(new THREE.Vector3()),a.fo.getWorldPosition(new THREE.Vector3()),a.ha.getWorldPosition(new THREE.Vector3())),right:{foreControl:foreControlAngles(I.rig.real.arm.R),upperControl:upperControlAngles(I.rig.real.arm.R),hinge:hinge('R'),angles:armAngles('R'),points:[I.rig.real.arm.R.up,I.rig.real.arm.R.fo,I.rig.real.arm.R.ha].map(b=>I.rig.chest.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray())},points:[a.up,a.fo,a.ha].map(b=>I.rig.chest.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray()),handQ:a.ha.getWorldQuaternion(new THREE.Quaternion()).toArray(),route:I.S.dualReachDiag||null,palm:a.ha.getWorldPosition(new THREE.Vector3()).add(I.rig.real.grip.L.pt.clone().applyQuaternion(a.ha.getWorldQuaternion(new THREE.Quaternion()))).sub(I.rig.real.backSwords[0].g.position).applyQuaternion(I.rig.real.backSwords[0].g.quaternion.clone().invert()).toArray(),grip:a.gripSolution?.slice(),plan:a.gripReach});}}};
 const times=[440,540,640,740,840,940,1000,1300,1750,1950,2500,2700,2900,3100,3300,3400];
 try{await views({mode:'dual',times,tag:'reach-'+tag,zoom:1.1,fy:1.05,width:.75});}
 finally{I.frame=frame;I.setCloak(saved.cloak);I.setMask(saved.mask);I.setBackGearVisible(back);}
 const sheet=document.getElementById('motionSheet'),detail=document.createElement('canvas');detail.width=sheet.width/times.length*8;detail.height=sheet.height;detail.getContext('2d').drawImage(sheet,0,0,sheet.width/times.length*8,sheet.height,0,0,detail.width,detail.height);
 await fetch('/debug/save?name=dual-reach-'+tag+'.png',{method:'POST',body:await new Promise(r=>detail.toBlob(r,'image/png'))});
 const report={tag,trace,shaderErrors:I.shaderErrors};await fetch('/debug/save?name=dual-reach-'+tag+'.json',{method:'POST',body:JSON.stringify(report,null,2)});return JSON.stringify({tag,samples:trace.length,shaderErrors:I.shaderErrors});
}
