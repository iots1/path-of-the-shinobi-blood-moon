import * as THREE from 'three';
import {views,hideSheet} from './motion_check.js';

export async function elbowSurfaceCheck(tag='before'){
  const I=window.__iso,saved={...I.EQUIPMENT},back=I.BACK_GEAR.visible;const out=document.createElement('canvas');out.width=1920;out.height=2400;
  const g=out.getContext('2d'),cases=[['idle',700],['combo',190],['combo',450],['dual',1750],['dual',1950]];
  const data=[];
  for(let row=0;row<cases.length;row++){
    const [mode,time]=cases[row];
    await views({mode,times:[time],angles:['front'],save:false});hideSheet();
    const R=I.rig.real;I.setCloak(false);I.setMask(false);I.setBackGearVisible(false);
    const skin=R.model.getObjectByProperty('isSkinnedMesh',true);
    const positions=skin.geometry.attributes.position,ids=skin.geometry.attributes.skinIndex,w=skin.geometry.attributes.skinWeight;
    R.skinning.update();const shoulder={n:0,meanDQminusLBS:0,maxDQminusLBS:0},elbow={n:0,maxDQminusLBS:0};
    for(let v=0;v<positions.count;v+=3){
      const p=new THREE.Vector3().fromBufferAttribute(positions,v);
      const names=[0,1,2,3].filter(k=>w.array[v*4+k]>.05).map(k=>skin.skeleton.bones[ids.array[v*4+k]].name);
      if(!names.some(n=>/Arm|Shoulder/.test(n)))continue;
      const a=R.skinning.getVertexPosition(v,new THREE.Vector3()),b=skin.getVertexPosition(v,new THREE.Vector3());
      const d=a.distanceTo(b);
      if(p.y>1.23&&Math.abs(p.x)<.30){shoulder.n++;shoulder.meanDQminusLBS+=d;shoulder.maxDQminusLBS=Math.max(shoulder.maxDQminusLBS,d);}
      else if(Math.abs(p.x)>.30&&Math.abs(p.x)<.45){elbow.n++;elbow.maxDQminusLBS=Math.max(elbow.maxDQminusLBS,d);}
    }
    shoulder.meanDQminusLBS/=Math.max(1,shoulder.n);data.push({mode,time,shoulder,elbow,twist:R.twist.snapshot(),
      matrices:Array.from(skin.skeleton.boneMatrices),dqReal:Array.from(R.skinning.real),dqDual:Array.from(R.skinning.dual),
      bind:skin.bindMatrix.toArray(),bindInverse:skin.bindMatrixInverse.toArray()});
    for(let column=0;column<4;column++){
      const linear=column>=2,side=column%2===1;
      R.skinning.enabled=!linear;
      I.CAM.yaw.y=I.CAM.yawT=I.rig.root.rotation.y*180/Math.PI+(side?-90:0);
      I.CAM.pitch.y=I.CAM.pitchT=5;I.CAM.zoom.y=I.CAM.zoomT=.8;I.CAM.focus.set(I.S.pos.x,1.25,I.S.pos.z);
      I.frame(0,0);const cv=I.renderer.domElement,cw=cv.height*.8,cx=cv.width/2-cw/2;
      g.drawImage(cv,cx,0,cw,cv.height*.83,column*480,row*480,480,450);
      g.fillStyle='#fff';g.fillRect(column*480,row*480+450,480,30);g.fillStyle='#111';g.font='16px system-ui';g.fillText(`${mode} ${time}ms · ${linear?'linear':'hybrid'} · ${side?'side':'front'}`,column*480+8,row*480+472);
    }
    R.skinning.enabled=true;
  }
  const blob=await new Promise(r=>out.toBlob(r,'image/png'));
  await fetch('/debug/save?name=elbow-surface-'+tag+'.png',{method:'POST',body:blob});
  await fetch('/debug/save?name=elbow-surface-'+tag+'.json',{method:'POST',body:JSON.stringify({data,shaderErrors:I.shaderErrors},null,2)});
  I.setCloak(saved.cloak);I.setMask(saved.mask);I.setBackGearVisible(back);
  return JSON.stringify({poses:data.length,tag,shaderErrors:I.shaderErrors});
}

export async function elbowEquipmentCheck(){
  const I=window.__iso,saved={...I.EQUIPMENT},back=I.BACK_GEAR.visible;
  // Accessory fitting samples the body; let it finish in idle before the
  // deterministic test starts posing the skeleton through attack frames.
  while(!I.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
  while([I.rig.real.equipmentCloak,I.rig.real.equipmentMask].some(x=>x?.status==='loading'))await new Promise(r=>setTimeout(r,100));
  I.stop();
  const poses=[['idle',700],['combo',190],['combo',450],['combo',760],['dual',840],['dual',1000],['dual',1750],['dual',1950],['run',1018],['issen',1320],['thrust',260]];
  const angles=[[0,6],[-90,6],[180,6],[90,6],[-135,6],[135,6],[45,35],[-45,35]];
  const results=[];
  for(const equipped of [false,true]){
    I.setCloak(equipped);I.setMask(equipped);I.setBackGearVisible(equipped);
    while(equipped&&[I.rig.real?.equipmentCloak,I.rig.real?.equipmentMask].some(x=>x?.status==='loading'))await new Promise(r=>setTimeout(r,100));
    if(equipped&&[I.rig.real?.equipmentCloak,I.rig.real?.equipmentMask].some(x=>x?.status!=='ready'))throw new Error('An accessory failed to load');
    const out=document.createElement('canvas');out.width=2400;out.height=poses.length*360;const g=out.getContext('2d');
    for(let row=0;row<poses.length;row++){
      const [mode,time]=poses[row];await views({mode,times:[time],angles:['front'],save:false});hideSheet();
      for(let col=0;col<angles.length;col++){
        const [yaw,pitch]=angles[col];I.CAM.yaw.y=I.CAM.yawT=I.rig.root.rotation.y*180/Math.PI+yaw;
        I.CAM.pitch.y=I.CAM.pitchT=pitch;I.CAM.zoom.y=I.CAM.zoomT=.9;I.CAM.focus.set(I.S.pos.x,1.18,I.S.pos.z);I.frame(0,0);
        const cv=I.renderer.domElement,cw=cv.height*.72,cx=cv.width/2-cw/2;
        g.drawImage(cv,cx,0,cw,cv.height*.87,col*300,row*360,300,330);
        g.fillStyle='#fff';g.fillRect(col*300,row*360+330,300,30);g.fillStyle='#111';g.font='14px system-ui';g.fillText(`${mode} ${time} · yaw ${yaw} / ${pitch}`,col*300+6,row*360+350);
      }
    }
    const label=equipped?'equipment':'bare';
    const blob=await new Promise(r=>out.toBlob(r,'image/png'));await fetch('/debug/save?name=joint-surface-'+label+'.png',{method:'POST',body:blob});
    results.push({label,poses:poses.length,angles:angles.length});
  }
  // Inspect each layer by itself in idle too, retaining user preferences afterward.
  for(const [cloak,mask,label] of [[true,false,'cloak-only'],[false,true,'mask-only']]){
    I.setCloak(cloak);I.setMask(mask);await views({mode:'idle',times:[700],tag:'joint-'+label,zoom:.8,fy:1.25});
  }
  I.setCloak(saved.cloak);I.setMask(saved.mask);I.setBackGearVisible(back);
  const report={results,shaderErrors:I.shaderErrors};
  await fetch('/debug/save?name=joint-surface-check.json',{method:'POST',body:JSON.stringify(report,null,2)});
  return JSON.stringify(report);
}
