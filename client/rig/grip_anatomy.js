import * as THREE from 'three';
import {naturalUpperFrame,hingeFlexAngle} from './hinge_frame.js';
const upper=new THREE.Quaternion(),fore=new THREE.Quaternion(),goal=new THREE.Quaternion(),roll=new THREE.Quaternion(),relative=new THREE.Quaternion(),q0i=new THREE.Quaternion(),restInverse=new THREE.Quaternion(),correction=new THREE.Quaternion();
const f=new THREE.Vector3(),fh=new THREE.Vector3(),axis=new THREE.Vector3(1,0,0);const rad=Math.PI/180;
// The round hilt permits palm roll. Use it to keep the wrist's residual axial
// rotation small, instead of exhausting forearm pronation and twisting the hand.
export function anatomicalGripRoll(a,side,sh,el,wr,base,direction,grip,previous,foreLimit=80){
 naturalUpperFrame(a,sh,el,wr,upper);const flex=hingeFlexAngle(a,sh,el,wr);
 fore.copy(upper).multiply(a.hingeFrame).multiply(roll.setFromAxisAngle(axis,flex)).multiply(a.foreAdapter);
 restInverse.copy(fore).invert();q0i.copy(a.q0).invert();f.copy(wr).sub(el).normalize();let best=Infinity,wanted=previous;
 for(let degrees=-90;degrees<=90;degrees+=5){
  const angle=degrees*rad;goal.copy(roll.setFromAxisAngle(direction,angle)).multiply(base).multiply(grip.K);
  relative.copy(q0i).multiply(restInverse).multiply(goal);
  let pronation=2*Math.atan2(relative.y,relative.w);pronation=Math.atan2(Math.sin(pronation),Math.cos(pronation));
  pronation=THREE.MathUtils.clamp(pronation,-foreLimit*rad,foreLimit*rad);
  correction.copy(fore).multiply(roll.setFromAxisAngle(a.foDir,pronation)).invert();relative.copy(q0i).multiply(correction).multiply(goal);
  let twist=2*Math.atan2(relative.y,relative.w);twist=Math.atan2(Math.sin(twist),Math.cos(twist))/rad;
  fh.copy(f).applyQuaternion(correction.copy(goal).invert());const bend=Math.acos(THREE.MathUtils.clamp(fh.y,-1,1))/rad,palm=side==='R'?-1:1,phi=Math.atan2(-fh.z,-palm*fh.x),fl=bend*Math.cos(phi),rd=bend*Math.sin(phi),e=Math.hypot(fl/(fl>=0?80:70),rd/(rd>=0?25:40));
  const continuity=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
  const cost=50*Math.max(0,e-.9)**2+10*(twist/25)**2+.15*e*e+.15*continuity*continuity;
  if(cost<best){best=cost;wanted=angle;}
 }
 return wanted;
}
