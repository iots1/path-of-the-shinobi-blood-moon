import * as THREE from 'three';
import {shoulderTrace,armAngles} from './motion_check.js';
import {upperControlAngles,foreControlAngles,hingeErrorDegrees} from '../rig/hinge_frame.js';
import {twistAngle} from '../rig/twist_math.mjs';
export async function jointAudit(){
 while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));const I=window.__iso,R=I.rig.real;
 while([R.equipmentCloak,R.equipmentMask].some(x=>x?.status==='loading'))await new Promise(r=>setTimeout(r,100));I.stop();
 const scenarios=[['quick-repeat',{until:7000,presses:[0,340,3500,3840],fn:'pressK'}],['delayed',{until:4400,presses:[0,848],fn:'pressK'}],['run-entry',{until:5600,runMs:1200,presses:[1200,1540],fn:'pressK'}]];
 const reports=[];
 for(const [name,options] of scenarios){
  const report={name,steps:0,jointSamples:0,violatingSamples:0,violations:{},worst:{},failures:[]};let started=false,time=0;const previous={},costs=[];
  const frame=I.frame;
  I.frame=(...args)=>{const cpuStart=performance.now();frame(...args);if(args[1]>0)costs.push(performance.now()-cpuStart);if(!(args[1]>0))return;if(I.S.act?.def===I.ATTACK2||I.S.act?.def===I.DUAL)started=true;if(!started)return;time+=args[1];report.steps++;
   for(const side of ['L','R']){
    const a=R.arm[side],angles=armAngles(side),upper=upperControlAngles(a),fore=foreControlAngles(a),sh=a.up.getWorldPosition(new THREE.Vector3()),el=a.fo.getWorldPosition(new THREE.Vector3()),wr=a.ha.getWorldPosition(new THREE.Vector3()),u=el.clone().sub(sh).normalize(),bend=wr.clone().sub(el).normalize();bend.addScaledVector(u,-bend.dot(u));const n=a.bendLocal.clone().applyQuaternion(a.up.getWorldQuaternion(new THREE.Quaternion()));n.addScaledVector(u,-n.dot(u));
    const hinge=hingeErrorDegrees(a,sh,el,wr);
    const hand=a.q0.clone().invert().multiply(a.ha.quaternion),axial=twistAngle(hand.toArray(),[0,1,0],0)*180/Math.PI;
    const anatomical=I.S.anatomicalArms&&(I.S.armConstraintBlend??1)>.999;
    const tests={elbow:Math.max(0,35-angles.elbow,angles.elbow-178),wrist:Math.max(0,angles.wrist-1)};
    // The restored K uses the original IK controller. Its world-space joint
    // ranges and hilt contact are checked here; authored hinge coordinates
    // belong to the constrained K K controller and its recovery.
    if(anatomical)Object.assign(tests,{upper:upper.error,hinge,foreFlex:Math.max(0,-5-fore.flexion,fore.flexion-145),foreRoll:Math.max(0,Math.abs(fore.roll)-85),foreSide:Math.abs(fore.side),wristAxial:Math.max(0,Math.abs(axial)-30)});
    if(I.S.act?.def===I.ATTACK2&&side==='L'&&I.S.act.t>=300&&I.S.act.t<=500){
      const axis=new THREE.Vector3(0,1,0).applyQuaternion(I.rig.katana.quaternion),palm=wr.clone().add(R.grip.L2.pt.clone().applyQuaternion(a.ha.getWorldQuaternion(new THREE.Quaternion()))),along=palm.clone().sub(I.rig.katana.position).dot(axis),seat=I.rig.katana.position.clone().addScaledVector(axis,THREE.MathUtils.clamp(along,-.17,-.06));
      tests.thrustSupportGap=palm.distanceTo(seat);tests.thrustSupportWeight=Math.max(0,.8-I.S.twoEff);
    }
    if(I.S.act?.def===I.DUAL&&side==='L'&&anatomical){
      const t=I.S.act.t;if(a.shoulderAttachment){const d=a.shoulderAttachment.appliedChestOffset||a.shoulderAttachment.chestOffset;tests.shoulderAttachment=Math.max(0,Math.hypot(d[0]/.012,d[1]/(d[1]>=0?.035:.012),d[2]/.012)-1);}
      if(t<I.DUAL.draw){tests.drawWristComfort=Math.max(0,Math.abs(angles.flex)-50.1,Math.abs(angles.radial)-23);const c=a.clavicleAngles;if(c)tests.clavicleControls=Math.max(0,-25-c.x,c.x-40,-20-c.y,c.y-20,-30-c.z,c.z-30);}
      if(t>=I.DUAL.draw-80&&t<I.DUAL.draw){const local=el.clone().sub(sh).applyQuaternion(I.rig.chest.getWorldQuaternion(new THREE.Quaternion()).invert());tests.drawElbowOut=Math.max(0,.04-local.x);tests.drawElbowForward=Math.max(0,local.z-.22);}
      if(t>=I.DUAL.draw&&t<I.DUAL.extractEnd)tests.extractionWristComfort=Math.max(0,Math.abs(angles.flex)-50.1,Math.abs(angles.radial)-25.1);
      if(t>=I.DUAL.spreadEnd&&t<I.DUAL.returnStart)tests.cutExtension=Math.max(0,160-angles.elbow);
      if(t>=I.DUAL.spreadEnd-8&&t<=I.DUAL.spreadEnd){tests.fullExtension=Math.max(0,165-angles.elbow);const local=wr.clone().sub(sh).applyQuaternion(I.rig.chest.getWorldQuaternion(new THREE.Quaternion()).invert());tests.sideReach=Math.max(0,.34-local.x);}
      if(t>=I.DUAL.draw&&report.drawAct!==I.S.act){const back=R.backSwords[0].g,hq=a.ha.getWorldQuaternion(new THREE.Quaternion());report.drawAct=I.S.act;report.drawY=wr.clone().add(R.grip.L.pt.clone().applyQuaternion(hq)).sub(back.position).applyQuaternion(back.quaternion.clone().invert()).y;}
      if(t>=I.DUAL.extractEnd-10&&t<I.DUAL.extractEnd){const back=R.backSwords[0].g,hq=a.ha.getWorldQuaternion(new THREE.Quaternion()),palm=wr.clone().add(R.grip.L.pt.clone().applyQuaternion(hq)).sub(back.position).applyQuaternion(back.quaternion.clone().invert()),blade=new THREE.Vector3(0,1,0).applyQuaternion(hq.multiply(R.grip.L.K.clone().invert())),axis=new THREE.Vector3(0,-1,0).applyQuaternion(back.quaternion);tests.extractionDistance=Math.max(0,I.DUAL.pullDistance-.025-(palm.y-report.drawY));tests.extractionLine=Math.hypot(palm.x,palm.z);tests.extractionBlade=blade.angleTo(axis)*180/Math.PI;}
    }
    const current={anatomical,wristQ:a.ha.quaternion.clone(),upper:a.up.quaternion.clone(),foreFlex:fore.flexion,foreRoll:fore.roll,axial,elbow:I.rig.chest.worldToLocal(el.clone())},prev=previous[side];
    if(prev){tests.upperSpeed=prev.upper.angleTo(current.upper)*180/Math.PI/(args[1]/1000);if(anatomical&&prev.anatomical){tests.foreFlexSpeed=Math.abs(fore.flexion-prev.foreFlex)/(args[1]/1000);tests.foreRollSpeed=Math.abs(fore.roll-prev.foreRoll)/(args[1]/1000);tests.wristAxialSpeed=Math.abs(axial-prev.axial)/(args[1]/1000);}tests.elbowSpeed=current.elbow.distanceTo(prev.elbow)/(args[1]/1000);}
    if(prev&&I.S.act?.def===I.DUAL&&side==='L'&&I.S.act.t>440&&I.S.act.t<I.DUAL.draw)tests.liftWristSpeed=prev.wristQ.angleTo(current.wristQ)*180/Math.PI/(args[1]/1000);
    previous[side]=current;
    const tolerances={thrustSupportGap:.025,thrustSupportWeight:.001,liftWristSpeed:500,shoulderAttachment:.00001,extractionWristComfort:.02,drawWristComfort:.02,drawElbowOut:.001,drawElbowForward:.001,clavicleControls:.001,fullExtension:.02,cutExtension:.02,sideReach:.001,extractionDistance:.001,extractionLine:.04,extractionBlade:25,upperSpeed:1800,foreFlexSpeed:651,foreRollSpeed:651,wristAxialSpeed:1500,elbowSpeed:6,upper:.02,elbow:.02,hinge:.02,foreFlex:.05,foreRoll:.02,foreSide:.02,wrist:.005,wristAxial:.05};
    report.jointSamples++;let invalid=false;
    for(const [key,value] of Object.entries(tests)){
     if(!report.worst[key]||value>report.worst[key].value)report.worst[key]={value,t:time,side,attack:I.S.act?.def===I.DUAL?'dual':I.S.act?.def===I.ATTACK2?'thrust':'idle',attackTime:I.S.act?.t??null,from:prev?{foreFlex:prev.foreFlex,foreRoll:prev.foreRoll}:null,to:{foreFlex:fore.flexion,foreRoll:fore.roll}};
     if(!Number.isFinite(value)||value>tolerances[key]){report.violations[key]=(report.violations[key]||0)+1;invalid=true;}
    }
    if(invalid){report.violatingSamples++;if(report.failures.length<30)report.failures.push({t:time,side,act:I.S.act?.t,angles,upper,fore,hinge,axial});}
   }
  };
  try{await shoulderTrace(options);}finally{I.frame=frame;}
  costs.sort((a,b)=>a-b);report.cpuMs={max:Math.max(...costs),p95:costs[Math.floor(costs.length*.95)],mean:costs.reduce((a,b)=>a+b,0)/costs.length};
  delete report.drawAct;delete report.drawY;reports.push(report);
 }
 const report={revision:I.runtimeRevision,pullDistance:I.DUAL.pullDistance,stepMs:4,reports,violations:reports.reduce((n,r)=>n+r.violatingSamples,0),shaderErrors:I.shaderErrors};
 await fetch('/debug/save?name=joint-audit.json',{method:'POST',body:JSON.stringify(report,null,2)});return JSON.stringify(report);
}
