import * as THREE from 'three';

// Video-reference run (art/reference/ninja-no-hood/ninja_run.mp4), v6.
// Each leg's cycle (phase p, 0 = front-foot contact) has two parts:
//  - stance (p < support): the ankle is planted on the ground and slides back linearly
//    from zF to zB (relative to the pelvis), so the foot does not skate at `stride`;
//  - swing: thigh angle / knee flexion keys read off the video frames (rear leg extends,
//    shin folds up to horizontal behind, knee drives forward-high, shin reaches down to land).
// Swing angles are joined to the stance's own angles at both ends, so the cycle is seamless.
// The pelvis height is set every frame so the planted foot reaches the ground exactly.
export const REFERENCE_RUN={amount:1,support:.40,zF:.30,zB:-.48,hMid:.71,hBob:.03,get stride(){ return (this.zF-this.zB)/this.support; }};
const TAU=Math.PI*2, RAD=Math.PI/180;
// [p, thigh angle from vertical (+ forward), knee flexion] in degrees
const SWING=[ [.46,-40,14],[.52,-44,22],[.60,-44,50],[.68,-30,72],[.75,-6,95],[.82,28,108],[.88,52,98],[.93,56,75],[.97,48,52] ];
// foot pitch (+ toe down), degrees — stance: heel-first contact, flat, heel rises before toe-off
const PITCH=[ [0,-8],[.06,0],[.22,0],[.40,50],[.48,62],[.56,75],[.64,82],[.72,75],[.80,50],[.88,20],[.95,-4],[1,-8] ];
const phase=u=>((u%1)+1)%1;
function catmull(keys,u,idx){ // keys with keys[0][0] ≤ u ≤ keys[last][0]; one-sided tangents at the ends
  let i=1;while(i<keys.length-1&&u>keys[i][0])i++;
  const a=keys[i-1],b=keys[i],p0=keys[i-2]||a,p3=keys[i+1]||b,dt=b[0]-a[0],t=(u-a[0])/dt,t2=t*t,t3=t2*t;
  const m1=(b[idx]-p0[idx])/(b[0]-p0[0])*dt, m2=(p3[idx]-a[idx])/(p3[0]-a[0])*dt;
  return (2*t3-3*t2+1)*a[idx]+(t3-2*t2+t)*m1+(-2*t3+3*t2)*b[idx]+(t3-t2)*m2;
}
const pitchAt=p=>catmull(PITCH,phase(p),1)*RAD;
const raiseOf=(pitch,lever)=>Math.max(0,Math.sin(pitch))*lever;
// pelvis (thigh-joint) height above the planted ankle: lowest at mid-stance, highest mid-flight
export function hipHeight(u){
  const R=REFERENCE_RUN, mid=.25+R.support/2;
  return R.hMid+R.hBob*(1-Math.cos(2*TAU*(u-mid)))/2;
}
export function strideSample(u){
  const p=phase(u),R=REFERENCE_RUN;
  return {phase:p,support:p<R.support,pitch:pitchAt(p)};
}
export function prepareReferenceRun(real,pos){
  real.referenceLeg={};
  for(const side of ['Left','Right']){
    const h=pos(side+'UpLeg'),k=pos(side+'Leg'),f=pos(side+'Foot'),toe=pos(side+'ToeBase');
    real.referenceLeg[side]={l1:h.distanceTo(k),l2:k.distanceTo(f),up:k.clone().sub(h).normalize(),low:f.clone().sub(k).normalize(),footY:f.y,toeLever:f.distanceTo(toe)};
  }
}
// 2D leg solve in the sagittal plane: hip→ankle offset (z forward, y down = h) → thigh angle, knee flexion
function legAngles(ref,z,h){
  const reach=ref.l1+ref.l2-.008, d=Math.min(reach,Math.max(.1,Math.hypot(z,h)));
  const a=Math.atan2(z,h), b=Math.acos(THREE.MathUtils.clamp((ref.l1*ref.l1+d*d-ref.l2*ref.l2)/(2*ref.l1*d),-1,1));
  const g=Math.acos(THREE.MathUtils.clamp((ref.l1*ref.l1+ref.l2*ref.l2-d*d)/(2*ref.l1*ref.l2),-1,1));
  return [a+b,Math.PI-g,Math.max(0,Math.hypot(z,h)-reach)];
}
// stance: planted ankle (relative to the pelvis centre) at phase p
function stanceZ(p){ const R=REFERENCE_RUN; return R.zF+(R.zB-R.zF)*p/R.support; }
function legPose(ref,p,dz,h){ // → [thigh, knee] radians at leg phase p; dz = this hip's z relative to the pelvis centre
  const R=REFERENCE_RUN, D=R.support, lever=ref.toeLever;
  const st=q=>legAngles(ref,stanceZ(q)-dz,h-raiseOf(pitchAt(q),lever));
  if(p<D) return st(p);
  // swing keys in radians, framed by the stance solution just before toe-off and just after contact
  const a0=st(D-.04),a1=st(D),b0=st(0),b1=st(.04);
  const keys=[[D-.04,a0[0],a0[1]],[D,a1[0],a1[1]],...SWING.map(k=>[k[0],k[1]*RAD,k[2]*RAD]),[1,b0[0],b0[1]],[1.04,b1[0],b1[1]]];
  return [catmull(keys,p,1),catmull(keys,p,2),0];
}
const _v=new THREE.Vector3(), _q=new THREE.Quaternion();
// Apply root-space targets to the actual rig. Knees bend forward in one plane;
// foot orientation is authored independently, so calf recovery cannot bank the sole.
export function applyReferenceRun(real,root,u,weight){
  if(weight<1e-5||!real.referenceLeg)return;
  root.updateMatrixWorld(true);
  const inv=root.matrixWorld.clone().invert(),rootQ=root.getWorldQuaternion(new THREE.Quaternion());
  const hipRL=side=>real.bone[side+'UpLeg'].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  // pelvis height: the thigh joints sit hipHeight(u) above the planted ankle
  const ref0=real.referenceLeg.Left, hl=hipRL('Left'), hr=hipRL('Right');
  const lift=(ref0.footY+hipHeight(u)-(hl.y+hr.y)/2)*weight;
  const hb=real.bone.Hips, wp=hb.getWorldPosition(new THREE.Vector3());
  wp.add(_v.set(0,1,0).applyQuaternion(rootQ).multiplyScalar(lift));
  hb.position.copy(hb.parent.worldToLocal(wp)); hb.updateMatrixWorld(true);
  const cz=(hipRL('Left').z+hipRL('Right').z)/2;
  const metrics={};
  for(const [side,offset,sign] of [['Left',0,1],['Right',.5,-1]]){
    const ref=real.referenceLeg[side],p=phase(u-.25+offset),pitch=pitchAt(p);
    const thigh=real.bone[side+'UpLeg'],shin=real.bone[side+'Leg'],foot=real.bone[side+'Foot'];
    const hip=hipRL(side), h=hip.y-ref.footY;
    const [th,kn,over]=legPose(ref,p,hip.z-cz,h);
    // FK ankle from the angles; the swing foot never dips below its planted height
    const sh=th-kn, ay=hip.y-ref.l1*Math.cos(th)-ref.l2*Math.cos(sh);
    const ankle=new THREE.Vector3(hip.x-sign*.025,Math.max(ay,ref.footY+raiseOf(pitch,ref.toeLever)),hip.z+ref.l1*Math.sin(th)+ref.l2*Math.sin(sh));
    const dir=ankle.clone().sub(hip),reach=ref.l1+ref.l2-.008;
    const d=Math.min(reach,Math.max(.06,dir.length()));dir.normalize();ankle.copy(hip).addScaledVector(dir,d);
    const pole=new THREE.Vector3(0,0,1).addScaledVector(dir,-dir.z).normalize();
    const ca=THREE.MathUtils.clamp((ref.l1*ref.l1+d*d-ref.l2*ref.l2)/(2*ref.l1*d),-1,1);
    const knee=hip.clone().addScaledVector(dir,ref.l1*ca).addScaledVector(pole,ref.l1*Math.sqrt(1-ca*ca));
    const set=(bone,q)=>{
      const local=bone.parent.getWorldQuaternion(_q).invert().multiply(rootQ.clone().multiply(q));
      bone.quaternion.slerp(local,weight);bone.updateMatrixWorld(true);
    };
    set(thigh,new THREE.Quaternion().setFromUnitVectors(ref.up,knee.clone().sub(hip).normalize()).multiply(real.bind[side+'UpLeg'].rl));
    set(shin,new THREE.Quaternion().setFromUnitVectors(ref.low,ankle.clone().sub(knee).normalize()).multiply(real.bind[side+'Leg'].rl));
    const sole=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,sign*3*RAD,0,'YXZ'));
    const unyaw=real.soleYaw[side].clone().invert();
    // the toes stay flat on the floor while the heel rises, then relax in the air
    const D=REFERENCE_RUN.support, toe=p<D?Math.max(0,pitch):Math.max(0,pitch)*Math.max(0,1-(p-D)/.08);
    set(foot,sole.clone().multiply(unyaw).multiply(real.bind[side+'Foot'].rl));
    set(real.bone[side+'ToeBase'],sole.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-toe)).multiply(unyaw).multiply(real.bind[side+'ToeBase'].rl));
    metrics[side]={phase:p,support:p<D,pitch,reachError:over,thigh:th/RAD,knee:kn/RAD,ankle:ankle.toArray()};
  }
  real.referenceRun=metrics;
}
// the pelvis height is handled inside applyReferenceRun now
export function referenceHipOffset(){ return 0; }
