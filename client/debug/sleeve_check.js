import * as THREE from 'three';
import {views,armAngles} from './motion_check.js';
export async function sleeveCheck(tag='before'){
 const I=window.__iso;
 while(!I.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
 while([I.rig.real.equipmentCloak,I.rig.real.equipmentMask].some(x=>x?.status==='loading'))await new Promise(r=>setTimeout(r,100));
 const saved={...I.EQUIPMENT},back=I.BACK_GEAR.visible;I.stop();I.setCloak(false);I.setMask(false);I.setBackGearVisible(false);
 const cases=[['combo',190],['combo',450],['combo',600],['dual',900],['dual',1080],['dual',1320]];
 const out=document.createElement('canvas');out.width=2000;out.height=cases.length*520;const g=out.getContext('2d'),records=[];
 for(let row=0;row<cases.length;row++){
  const [mode,time]=cases[row];await views({mode,times:[time],angles:['front'],save:false});document.getElementById('motionSheet').style.display='none';
  const arms={};for(const side of ['L','R']){const a=I.rig.real.arm[side];arms[side]={angles:armAngles(side),world:[a.up,a.fo,a.ha].map(b=>b.getWorldPosition(new THREE.Vector3()).toArray()),handQ:a.ha.getWorldQuaternion(new THREE.Quaternion()).toArray(),chest:[a.up,a.fo,a.ha].map(b=>I.rig.chest.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray())};}
  const skin=I.rig.real.model.getObjectByProperty('isSkinnedMesh',true);I.rig.real.skinning.update();
  records.push({mode,time,arms,twist:I.rig.real.twist.snapshot(),supportElbow:I.rig.real.supportElbow?.last,matrices:Array.from(skin.skeleton.boneMatrices),dqReal:Array.from(I.rig.real.skinning.real),dqDual:Array.from(I.rig.real.skinning.dual),bind:skin.bindMatrix.toArray(),bindInverse:skin.bindMatrixInverse.toArray(),swords:[I.rig.katana,I.rig.katana2].map(b=>({p:b.position.toArray(),q:b.quaternion.toArray()}))});
  for(let col=0;col<4;col++){
   const yaw=[0,-90,180,90][col];I.CAM.yaw.y=I.CAM.yawT=I.rig.root.rotation.y*180/Math.PI+yaw;I.CAM.pitch.y=I.CAM.pitchT=6;I.CAM.zoom.y=I.CAM.zoomT=.64;I.CAM.focus.set(I.S.pos.x,(arms.L.world[0][1]+arms.R.world[0][1]+arms.L.world[2][1]+arms.R.world[2][1])/4+.06,I.S.pos.z);I.frame(0,0);
   const cv=I.renderer.domElement,cw=cv.height*.75,cx=cv.width/2-cw/2;g.drawImage(cv,cx,0,cw,cv.height*.8,col*500,row*520,500,490);
   g.fillStyle='#fff';g.fillRect(col*500,row*520+490,500,30);g.fillStyle='#111';g.font='17px system-ui';g.fillText(`${mode} ${time}ms · ${['front','right','back','left'][col]}`,col*500+8,row*520+512);
  }
 }
 const detail=document.createElement('canvas');detail.width=500;detail.height=520;detail.getContext('2d').drawImage(out,1500,520,500,520,0,0,500,520);
 await fetch('/debug/save?name=sleeve-450-'+tag+'.png',{method:'POST',body:await new Promise(r=>detail.toBlob(r,'image/png'))});
 await fetch('/debug/save?name=sleeve-'+tag+'.png',{method:'POST',body:await new Promise(r=>out.toBlob(r,'image/png'))});
 await fetch('/debug/save?name=sleeve-'+tag+'.json',{method:'POST',body:JSON.stringify({records,shaderErrors:I.shaderErrors},null,2)});
 I.setCloak(saved.cloak);I.setMask(saved.mask);I.setBackGearVisible(back);return JSON.stringify({tag,poses:records.length,shaderErrors:I.shaderErrors});
}
