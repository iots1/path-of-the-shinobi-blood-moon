import * as THREE from 'three';

const RAD=Math.PI/180;
export const UPPER_ROLL_LIMITS={rate:450*RAD,acceleration:6000*RAD,tau:.045};

// Parallel transport retains the previous roll while following the newly
// solved shoulder->elbow direction. Only the remaining axial rotation eases.
// Counter-rotation of the forearm preserves its complete downstream pose.
export function createUpperArmRoll(real){
  const arms=['R','L'].map(side=>{const arm=real.arm[side];arm.upRest=(real.bind?.[(side==='L'?'Left':'Right')+'Arm']?.q||arm.up.quaternion).clone();return {side,arm,previous:null,velocity:0,last:null};});
  for(const state of arms){const a=state.arm,label=state.side==='L'?'Left':'Right',o=real.bind?.[label+'Arm']?.rl,p=real.bind?.[label+'Shoulder']?.rl;
    if(o&&p){const y=a.upDir.clone().applyQuaternion(o).normalize(),z=new THREE.Vector3(0,0,1);z.addScaledVector(y,-z.dot(y)).normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize(),c=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
      a.controlRestInverse=c.clone().invert().multiply(p);a.controlAdapterInverse=o.clone().invert().multiply(c);
      const of=real.bind[label+'ForeArm'].rl,yf=a.foDir.clone().applyQuaternion(of).normalize(),zf=new THREE.Vector3(0,0,1);zf.addScaledVector(yf,-zf.dot(yf)).normalize();const xf=new THREE.Vector3().crossVectors(yf,zf).normalize(),cf=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xf,yf,zf));
      a.foreControlRestInverse=cf.clone().invert().multiply(o);a.foreControlAdapterInverse=of.clone().invert().multiply(cf);
      a.hingeFrame=a.foreControlRestInverse.clone().invert();a.foreAdapter=a.foreControlAdapterInverse.clone().invert();
      const fy=new THREE.Vector3(0,1,0).applyQuaternion(a.hingeFrame),fz=new THREE.Vector3(0,0,1).applyQuaternion(a.hingeFrame);a.hingeC=a.upDir.dot(fy);a.hingeS=a.upDir.dot(fz);
      const phi=Math.atan2(a.hingeS,a.hingeC),lo=-5*RAD,hi=145*RAD,d=t=>a.hingeC*Math.cos(t)+a.hingeS*Math.sin(t),vals=[d(lo),d(hi)];if(phi>=lo&&phi<=hi)vals.push(d(phi));
      const reach=c=>Math.sqrt(Math.max(0,a.l1*a.l1+a.l2*a.l2+2*a.l1*a.l2*c));a.hingeReach={min:Math.max(reach(Math.min(...vals)),Math.sqrt(a.l1*a.l1+a.l2*a.l2-2*a.l1*a.l2*Math.cos(35*RAD)))+1e-6,max:reach(Math.max(...vals))-1e-6};}
  }
  const wanted=new THREE.Quaternion(),transport=new THREE.Quaternion(),relative=new THREE.Quaternion();
  const pair=new THREE.Quaternion(),twist=new THREE.Quaternion(),oldDirection=new THREE.Vector3(),direction=new THREE.Vector3();
  const oldElbow=new THREE.Vector3(),newElbow=new THREE.Vector3(),restored=new THREE.Quaternion();
  const stats={samples:0,maxElbowErrorM:0,maxDownstreamRotationErrorDegrees:0,maxRateDegrees:0,maxFilteredRateDegrees:0};
  return {arms,stats,update(dt,anatomical=false,rest=null){
    for(const state of arms){
      const {arm:a}=state,axis=a.upDir;
      wanted.copy(a.up.quaternion);
      // Anatomical IK already solves the control frames and the elbow hinge
      // together. Re-projecting its bend plane here can select the other
      // carrying-angle branch near extension and undo that continuous solve.
      if(anatomical){state.previous=wanted.clone();state.velocity=0;continue;}
      const restWeight=rest?.upperWeightFor(state.side)||0;
      if(restWeight>1e-6)wanted.slerp(rest.upperTarget(state.side),restWeight).normalize();
      if(!state.previous){state.previous=wanted.clone();continue;}
      oldDirection.copy(axis).applyQuaternion(state.previous).normalize();
      direction.copy(axis).applyQuaternion(wanted).normalize();
      transport.setFromUnitVectors(oldDirection,direction).multiply(state.previous);
      relative.copy(transport).invert().multiply(wanted);
      const raw=2*Math.atan2(relative.x*axis.x+relative.y*axis.y+relative.z*axis.z,relative.w);
      const error=Math.atan2(Math.sin(raw),Math.cos(raw));
      const desiredVelocity=THREE.MathUtils.clamp(error/UPPER_ROLL_LIMITS.tau,-UPPER_ROLL_LIMITS.rate,UPPER_ROLL_LIMITS.rate);
      const acceleration=UPPER_ROLL_LIMITS.acceleration*Math.max(0,dt);
      state.velocity+=THREE.MathUtils.clamp(desiredVelocity-state.velocity,-acceleration,acceleration);
      // A moving target may reverse before this motion has stopped. Preserve
      // bounded deceleration through that reversal instead of snapping to zero.
      const step=state.velocity*Math.max(0,dt);
      pair.copy(a.up.quaternion).multiply(a.fo.quaternion);
      oldElbow.copy(a.fo.position).applyQuaternion(a.up.quaternion);
      twist.setFromAxisAngle(axis,step);
      a.up.quaternion.copy(transport).multiply(twist).normalize();
      a.fo.quaternion.copy(a.up.quaternion).invert().multiply(pair).normalize();
      a.up.updateMatrixWorld(true);
      state.previous.copy(a.up.quaternion);
      newElbow.copy(a.fo.position).applyQuaternion(a.up.quaternion);
      restored.copy(a.up.quaternion).multiply(a.fo.quaternion);
      stats.samples++;
      stats.maxElbowErrorM=Math.max(stats.maxElbowErrorM,newElbow.distanceTo(oldElbow));
      stats.maxDownstreamRotationErrorDegrees=Math.max(stats.maxDownstreamRotationErrorDegrees,restored.normalize().angleTo(pair.normalize())/RAD);
      stats.maxFilteredRateDegrees=Math.max(stats.maxFilteredRateDegrees,dt>0?Math.abs(step/dt)/RAD:0);
      stats.maxRateDegrees=Math.max(stats.maxRateDegrees,dt>0?Math.abs(step)/dt/RAD:0);
      state.last={wantedDegrees:error/RAD,stepDegrees:step/RAD,rateDegrees:dt>0?step/dt/RAD:0};
    }
  }};
}
