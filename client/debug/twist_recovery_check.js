import * as THREE from 'three';
import {views} from './motion_check.js';
export async function twistRecoveryCheck(tag='before'){
 const I=window.__iso;while(!I?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
 while([I.rig.real.equipmentCloak,I.rig.real.equipmentMask].some(x=>x?.status==='loading'))await new Promise(r=>setTimeout(r,100));
 I.stop();const saved={...I.EQUIPMENT},back=I.BACK_GEAR.visible;I.setCloak(false);I.setMask(false);I.setBackGearVisible(false);
 const frame=I.frame,segments=I.rig.real.twist.segments,trace=[],stats={maxAbsRoll:0,maxRollStep:0,maxSourceChange:0,maxWristChangeM:0,nonFinite:0};let previous=null,step=0;
 I.frame=(...args)=>{
  frame(...args);if(!(args[1]>0))return;
  const R=I.rig.real,quaternions=segments.map(s=>s.source.quaternion.clone()),hands=['L','R'].map(side=>R.arm[side].ha.getWorldPosition(new THREE.Vector3()));
  R.skinning.update();const snap=R.twist.snapshot();
  for(let i=0;i<snap.length;i++){
   stats.maxAbsRoll=Math.max(stats.maxAbsRoll,Math.abs(snap[i].rollDegrees));if(previous)stats.maxRollStep=Math.max(stats.maxRollStep,Math.abs(snap[i].rollDegrees-previous[i].rollDegrees));
   stats.maxSourceChange=Math.max(stats.maxSourceChange,segments[i].source.quaternion.angleTo(quaternions[i])*180/Math.PI);if(!snap[i].finite)stats.nonFinite++;
  }
  ['L','R'].forEach((side,i)=>stats.maxWristChangeM=Math.max(stats.maxWristChangeM,R.arm[side].ha.getWorldPosition(new THREE.Vector3()).distanceTo(hands[i])));
  if(step++%5===0)trace.push({t:step*4,phase:I.S.phase,attackTime:I.S.act?.t??null,segments:snap});previous=snap;
 };
 try{await views({mode:'dual',presses:[0,340,3500,3840],times:[700,1300,1900,2600,3400,4300,5200,6500,7300],tag:'twist-'+tag,zoom:.9,fy:1.12});}
 finally{I.frame=frame;I.setCloak(saved.cloak);I.setMask(saved.mask);I.setBackGearVisible(back);}
 const sheet=document.getElementById('motionSheet'),detail=document.createElement('canvas');detail.width=sheet.width/9;detail.height=sheet.height/4;
 detail.getContext('2d').drawImage(sheet,4*sheet.width/9,0,sheet.width/9,sheet.height/4,0,0,detail.width,detail.height);
 await fetch('/debug/save?name=dual-return-'+tag+'.png',{method:'POST',body:await new Promise(r=>detail.toBlob(r,'image/png'))});
 const report={tag,stats,trace,shaderErrors:I.shaderErrors};await fetch('/debug/save?name=twist-recovery-'+tag+'.json',{method:'POST',body:JSON.stringify(report,null,2)});
 if(tag==='after'&&(stats.maxAbsRoll>90.0001||stats.maxRollStep>1.8001||stats.maxWristChangeM>1e-8||stats.maxSourceChange>.001||stats.nonFinite))throw new Error('Skin winding or source-pose preservation regression: '+JSON.stringify(stats));
 return JSON.stringify({tag,stats,shaderErrors:I.shaderErrors});
}
