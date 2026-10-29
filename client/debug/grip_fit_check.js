import * as THREE from 'three';
import {solveConstrainedGrip} from '../rig/constrained_grip.js';
export async function gripFitCheck(){
 while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));const I=window.__iso;I.stop();I.pressK();for(let t=0;t<404;t+=4)I.frame(0,4,true);I.pressK();I.frame(0,4,true);
 const R=I.rig.real,a=R.arm.L,back=R.backSwords[0].g,target=new THREE.Vector3(0,.0835,0).applyQuaternion(back.quaternion).add(back.position),axis=new THREE.Vector3(0,-1,0).applyQuaternion(back.quaternion),cq=I.rig.chest.getWorldQuaternion(new THREE.Quaternion()),results=[];
 for(const flex of [-80,0,80,140])for(const roll of [-80,0,80]){a.gripSolution=[flex,60,roll,100,0,0,0,0];results.push(solveConstrainedGrip(a,'L',target,axis,R.grip.L,cq,1));}
 await fetch('/debug/save?name=grip-fit.json',{method:'POST',body:JSON.stringify(results,null,2)});return JSON.stringify(results);
}
