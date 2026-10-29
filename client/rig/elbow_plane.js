import * as THREE from 'three';

// A nearly extended supporting arm can bow upward on the swivel circle.
// Rotate the chain about shoulder->wrist, retaining the complete hand pose.
// This changes the elbow plane, not the hand target or the elbow bend angle.
export function createSupportElbowPlane(real){
  const a=real.arm.L,rad=Math.PI/180,clamp=THREE.MathUtils.clamp;
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  const sh=new THREE.Vector3(),el=new THREE.Vector3(),wr=new THREE.Vector3(),axis=new THREE.Vector3(),up=new THREE.Vector3(),relative=new THREE.Vector3(),candidate=new THREE.Vector3();
  const delta=new THREE.Quaternion(),hand=new THREE.Quaternion(),parent=new THREE.Quaternion(),upper=new THREE.Quaternion(),fore=new THREE.Quaternion(),inverseHand=new THREE.Quaternion();
  const stats={samples:0,maxWristErrorM:0,maxHandErrorDegrees:0,maxRateDegrees:0,maxCorrectionDegrees:0,maxProjectionDegrees:0};
  let angle=0;
  const state={enabled:true,stats,last:null,update(dt,S,chest,comboActive){
    a.up.updateWorldMatrix(true,true);a.up.getWorldPosition(sh);a.fo.getWorldPosition(el);a.ha.getWorldPosition(wr);a.ha.getWorldQuaternion(hand);inverseHand.copy(hand).invert();
    axis.copy(wr).sub(sh).normalize();relative.copy(el).sub(sh);
    up.set(0,1,0).applyQuaternion(chest.getWorldQuaternion(parent));
    const interior=sh.clone().sub(el).angleTo(wr.clone().sub(el))/rad;
    const weight=state.enabled&&comboActive?Math.min(1,S.twoEff||0)*(1-Math.min(1,S.dualEff||0))*smooth((interior-125)/30):0;
    const centerY=wr.clone().sub(sh).dot(up)*a.l1/(a.l1+a.l2);
    const wristUse=E=>{const f=wr.clone().sub(E).normalize().applyQuaternion(inverseHand),bend=Math.acos(clamp(f.y,-1,1)),phi=Math.atan2(-f.z,-f.x),fl=bend*Math.cos(phi)/rad,rd=bend*Math.sin(phi)/rad;return Math.hypot(fl/(fl>=0?80:70),rd/(rd>=0?25:40));};
    const allowed=Math.max(1,wristUse(el));
    let best=Infinity,wanted=0;
    if(weight>.001)for(let degrees=-55;degrees<=55;degrees+=2.5){
      candidate.copy(relative).applyAxisAngle(axis,degrees*rad).add(sh);
      const bow=Math.max(0,candidate.clone().sub(sh).dot(up)-centerY-.008),over=Math.max(0,wristUse(candidate)-allowed);
      const cost=20000*bow*bow+.004*degrees*degrees+10000*over*over;
      if(cost<best){best=cost;wanted=degrees*rad*weight;}
    }
    const previous=angle;
    const step=clamp((wanted-angle)*(1-Math.exp(-Math.max(0,dt)/.065)),-240*rad*Math.max(0,dt),240*rad*Math.max(0,dt));angle+=step;
    // A changing grip can narrow the valid elbow-plane interval faster than the
    // easing. The existing wrist envelope wins, as in limitWrist().
    candidate.copy(relative).applyAxisAngle(axis,angle).add(sh);
    if(wristUse(candidate)>allowed+1e-5){
      let low=0,high=1;
      for(let k=0;k<18;k++){const mid=(low+high)/2;candidate.copy(relative).applyAxisAngle(axis,angle*mid).add(sh);if(wristUse(candidate)<=allowed+1e-5)low=mid;else high=mid;}
      const projected=angle*low;stats.maxProjectionDegrees=Math.max(stats.maxProjectionDegrees,Math.abs(angle-projected)/rad);angle=projected;
    }
    if(Math.abs(angle)>1e-8){
      a.up.getWorldQuaternion(upper);a.up.parent.getWorldQuaternion(parent);
      delta.setFromAxisAngle(axis,angle);a.up.quaternion.copy(parent.invert()).multiply(delta).multiply(upper).normalize();a.up.updateMatrixWorld(true);
      a.fo.getWorldQuaternion(fore);a.ha.quaternion.copy(fore.invert()).multiply(hand).normalize();a.ha.updateMatrixWorld(true);
    }
    const error=a.ha.getWorldPosition(candidate).distanceTo(wr),qError=a.ha.getWorldQuaternion(parent).normalize().angleTo(hand.normalize())/rad;
    stats.samples++;stats.maxWristErrorM=Math.max(stats.maxWristErrorM,error);stats.maxHandErrorDegrees=Math.max(stats.maxHandErrorDegrees,qError);
    stats.maxRateDegrees=Math.max(stats.maxRateDegrees,dt>0?Math.abs((angle-previous)/dt)/rad:0);stats.maxCorrectionDegrees=Math.max(stats.maxCorrectionDegrees,Math.abs(angle)/rad);
    state.last={angleDegrees:angle/rad,interior,bowBeforeM:relative.dot(up)-centerY,bowAfterM:a.fo.getWorldPosition(candidate).sub(sh).dot(up)-centerY};
  }};return state;
}
