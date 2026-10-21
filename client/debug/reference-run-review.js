import {strideSample,REFERENCE_RUN} from '../rig/reference_run.js';
const save=(name,body)=>fetch('/debug/save?name='+name,{method:'POST',body:body instanceof Blob?body:JSON.stringify(body,null,1)});
export async function reviewReferenceRun(I,tag='video-v4'){
 I.stop();I.loop('off');const S=I.S,R=I.rig.real,V=R.hipsPos.constructor;
 const pin=()=>{S.pos.set(2.5,0,-1);S.moveTo=new V(2.5,0,20);S.facing=0;};
 S.act=null;S.phase='idle';S.speed=1;S.vel.set(0,0,0);
 for(let i=0;i<350;i++){pin();I.frame(0,4,true);}
 const wp=n=>R.bone[n].getWorldPosition(new V()),local=p=>I.rig.root.worldToLocal(p.clone());
 const metrics={slip:[],knee:[],reach:[],lateral:[],samples:[],cycleSeam:{}};const previous={};
 for(let i=0;i<360;i++){
  pin();I.frame(0,4,true);
  for(const [side,off] of [['Left',0],['Right',.5]]){
   const p=strideSample(R.loco.u-.25+off),foot=local(wp(side+'Foot')),hip=local(wp(side+'UpLeg')),knee=local(wp(side+'Leg'));
   const bend=hip.clone().sub(knee).angleTo(foot.clone().sub(knee))*180/Math.PI;
   metrics.knee.push(bend);metrics.reach.push(R.referenceRun[side].reachError);metrics.lateral.push(Math.abs(foot.x-hip.x));
   if(previous[side]&&p.phase>.04&&p.phase<.21){const v=(foot.z-previous[side].z)/.004;metrics.slip.push(Math.abs(v+Math.hypot(S.vel.x,S.vel.z)));}
   previous[side]=foot;
   if(i%15===0)metrics.samples.push({side,phase:p.phase,knee:bend,ankle:foot.toArray(),hip:hip.toArray()});
  }
 }
 const a=strideSample(0),b=strideSample(1-1e-6);
 metrics.cycleSeam={pitch:Math.abs(a.pitch-b.pitch)};
 metrics.summary={plantedFootSlipMax:Math.max(...metrics.slip),kneeMin:Math.min(...metrics.knee),kneeMax:Math.max(...metrics.knee),reachClampMax:Math.max(...metrics.reach),lateralMax:Math.max(...metrics.lateral)};
 metrics.pass=metrics.summary.plantedFootSlipMax<.25&&metrics.summary.kneeMin>25&&metrics.summary.kneeMax<175&&metrics.summary.reachClampMax<.025&&metrics.summary.lateralMax<.06&&Object.values(metrics.cycleSeam).every(x=>x<.0001);
 await save('reference-run-'+tag+'.json',metrics);
 const scene=I.rig.root.parent,keep=new Set([I.rig.root,I.rig.katana,I.rig.katana2,...I.rig.eyes]);
 for(const o of scene.children)if(!keep.has(o)&&!o.isLight)o.visible=false;
 const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1240;const g=canvas.getContext('2d'),phases=[0,.16,.32,.48,.64,.82];
 const was=REFERENCE_RUN.amount;
 for(let row=0;row<2;row++){
  REFERENCE_RUN.amount=row;
  for(let i=0;i<phases.length;i++){
   for(let k=0;k<70;k++){pin();R.loco.u=(.25+phases[i]-.004*4/(row?REFERENCE_RUN.stride:R.loco.run.stride)+1)%1;I.frame(0,4,true);}
   I.CAM.yaw.y=I.CAM.yawT=S.facing*180/Math.PI-90;I.CAM.pitch.y=I.CAM.pitchT=0;I.CAM.zoom.y=I.CAM.zoomT=1.65;I.CAM.focus.set(S.pos.x,.9,S.pos.z);I.frame(0,0);
   const cv=I.renderer.domElement,sw=cv.height*300/620;
   g.drawImage(cv,(cv.width-sw)/2,0,sw,cv.height,i*300,row*620,300,620);
   g.fillStyle='#222';g.fillRect(i*300,row*620,300,28);g.fillStyle='#fff';g.font='16px sans-serif';g.fillText((row?'VIDEO v6':'CLIP v3')+' '+Math.round(phases[i]*100)+'%',i*300+8,row*620+20);
  }
 }
 REFERENCE_RUN.amount=was;S.moveTo=null;
 await save('reference-run-'+tag+'.png',await new Promise(r=>canvas.toBlob(r)));
 return (metrics.pass?'PASS ':'FAIL ')+JSON.stringify(metrics.summary)+' — saved comparison + planted-foot checks';
}
