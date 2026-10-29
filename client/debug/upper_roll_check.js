import * as THREE from 'three';
import {createUpperArmRoll,UPPER_ROLL_LIMITS} from '../rig/upper_arm_roll.js';

const D=180/Math.PI;
const cases=[
  {name:'single',press:[0],until:1800},
  {name:'combo',press:[0,420,860],until:2400},
  {name:'dual-quick',press:[0,340],dual:true,until:3000},
  {name:'dual-late',press:[0,848],dual:true,until:3500},
  {name:'dual-from-run',press:[800,1140],dual:true,run:800,until:3800}
];

function syntheticChecks(){
  const root=new THREE.Group(),real={arm:{}};
  const bind=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,-.4,.2));
  for(const side of ['R','L']){
    const up=new THREE.Bone(),fo=new THREE.Bone(),ha=new THREE.Bone();
    root.add(up);up.add(fo);fo.add(ha);
    fo.position.set(.18,.04,-.02);ha.position.set(.21,.02,.01);
    real.arm[side]={up,fo,ha,upDir:fo.position.clone().normalize()};
  }
  const controller=createUpperArmRoll(real),dt=.004,velocities=[0,0];
  let maxPointError=0,maxRotationError=0;
  for(let frame=0;frame<600;frame++){
    root.quaternion.setFromEuler(new THREE.Euler(.1,.2+frame*.002,-.15));
    const before=[];
    for(const a of Object.values(real.arm)){
      const roll=frame<100?0:frame<250?175:frame<400?-175:0;
      a.up.quaternion.copy(bind).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.4*Math.sin(frame*.015))).multiply(new THREE.Quaternion().setFromAxisAngle(a.upDir,roll*Math.PI/180));
      a.fo.quaternion.setFromEuler(new THREE.Euler(.4,-.3,.1));a.ha.quaternion.setFromEuler(new THREE.Euler(-.2,.1,.3));
      root.updateMatrixWorld(true);
      before.push({point:a.ha.getWorldPosition(new THREE.Vector3()),rotation:a.ha.getWorldQuaternion(new THREE.Quaternion()).normalize()});
    }
    controller.update(dt);
    for(let i=0;i<2;i++){
      const state=controller.arms[i],a=state.arm;
      maxPointError=Math.max(maxPointError,a.ha.getWorldPosition(new THREE.Vector3()).distanceTo(before[i].point));
      maxRotationError=Math.max(maxRotationError,a.ha.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(before[i].rotation)*D);
      if(Math.abs(state.velocity)>UPPER_ROLL_LIMITS.rate+1e-9)throw new Error('Synthetic axial speed exceeded limit');
      if(Math.abs(state.velocity-velocities[i])>UPPER_ROLL_LIMITS.acceleration*dt+1e-9)throw new Error('Synthetic acceleration exceeded limit');
      velocities[i]=state.velocity;
    }
  }
  if(maxPointError>1e-10||maxRotationError>1e-5)throw new Error('Synthetic grip preservation failed');
  return {frames:600,arms:2,maxPointErrorM:maxPointError,maxRotationErrorDegrees:maxRotationError};
}

export async function upperRollCheck(baseline=false){
  const synthetic=baseline?null:syntheticChecks();
  while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
  const I=window.__iso,R=I.rig.real,S=I.S;I.stop();I.loop('off');S.speed=1;
  const key=(down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:'a',shiftKey:false}));
  const traces=[],summary=[];
  const point=o=>o.getWorldPosition(new THREE.Vector3()).toArray();
  const rotation=o=>o.getWorldQuaternion(new THREE.Quaternion()).toArray();
  for(const scenario of cases){
    key(false);I.loop('off');S.act=null;S.phase='idle';S.combo=-1;S.queued=false;S.queuedK=false;
    S.clock=0;S.lastAct=null;S.vel.set(0,0,0);S.moveTo=null;S.pos.set(2.5,0,-1);S.facing=-Math.PI/4;
    for(let t=0;t<5000;t+=4)I.frame(0,4,true);
    S.pos.set(2.5,0,-1);S.facing=-Math.PI/4;
    if(scenario.run)key(true);
    const rows=[];let press=0,maxRate=0,previous=null;
    for(let t=0;t<scenario.until;t+=4){
      if(scenario.run&&t===scenario.run)key(false);
      if(press<scenario.press.length&&t>=scenario.press[press]){(scenario.dual?I.pressK:I.press)();press++;}
      I.frame(0,4,true);
      const arms=['R','L'].map(side=>{
        const a=R.arm[side],q=a.up.quaternion.clone(),axis=a.upDir.clone();
        return {wrist:point(a.ha),hand:rotation(a.ha),elbow:point(a.fo),upper:q.toArray(),axis:axis.toArray()};
      });
      if(previous)for(let i=0;i<2;i++){
        const old=new THREE.Quaternion().fromArray(previous[i].upper),now=new THREE.Quaternion().fromArray(arms[i].upper),axis=new THREE.Vector3().fromArray(arms[i].axis);
        const v0=axis.clone().applyQuaternion(old),v1=axis.clone().applyQuaternion(now);
        const transported=old.premultiply(new THREE.Quaternion().setFromUnitVectors(v0,v1));
        // Independent signed residual roll between frames after removing swing.
        const relative=transported.invert().multiply(now),angle=2*Math.atan2(relative.x*axis.x+relative.y*axis.y+relative.z*axis.z,relative.w);
        maxRate=Math.max(maxRate,Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))*D/.004);
      }
      previous=arms;
      rows.push({t,arms,sword:point(I.rig.katana),blade:rotation(I.rig.katana),sword2:point(I.rig.katana2),blade2:rotation(I.rig.katana2),sword2Visible:I.rig.katana2.visible});
    }
    key(false);traces.push({name:scenario.name,rows});summary.push({name:scenario.name,frames:rows.length,maxAxialRateDegreesPerSecond:maxRate});
  }
  const save=(name,data)=>fetch('/debug/save?name='+name,{method:'POST',body:JSON.stringify(data)});
  if(baseline){await save('upper-roll-before.json',{traces,summary});return JSON.stringify({baseline:true,summary});}
  // Local dev fixture copied from out/upper-roll-before.json for the A/B run.
  const response=await fetch('/debug/upper-roll-baseline.json',{cache:'no-cache'});
  const before=response.ok?await response.json():null;
  let maxPointError=before?0:null,maxOrientationError=before?0:null;const q=new THREE.Quaternion(),q2=new THREE.Quaternion();
  if(before)for(let i=0;i<traces.length;i++)for(let j=0;j<traces[i].rows.length;j++){
    const a=traces[i].rows[j],b=before.traces[i].rows[j];
    const distance=(x,y)=>Math.hypot(...x.map((v,k)=>v-y[k]));
    for(let side=0;side<2;side++){
      maxPointError=Math.max(maxPointError,distance(a.arms[side].wrist,b.arms[side].wrist),distance(a.arms[side].elbow,b.arms[side].elbow));
      maxOrientationError=Math.max(maxOrientationError,q.fromArray(a.arms[side].hand).normalize().angleTo(q2.fromArray(b.arms[side].hand).normalize())*D);
    }
    for(const [pos,rot] of [['sword','blade'],['sword2','blade2']]){
      if(pos==='sword2'&&!a.sword2Visible&&!b.sword2Visible)continue;
      maxPointError=Math.max(maxPointError,distance(a[pos],b[pos]));
      maxOrientationError=Math.max(maxOrientationError,q.fromArray(a[rot]).normalize().angleTo(q2.fromArray(b[rot]).normalize())*D);
    }
  }
  I.frame(0,0);
  const failures=[];
  if(summary.some(x=>x.maxAxialRateDegreesPerSecond>451))failures.push('Upper-arm axial rate exceeds 450 degrees/s');
  if(maxPointError>.001)failures.push('Trajectory differs by more than 1 mm');
  if(maxOrientationError>.1)failures.push('Hand/blade orientation differs by more than 0.1 degree');
  if(R.upperRoll.stats.maxElbowErrorM>1e-6||R.upperRoll.stats.maxDownstreamRotationErrorDegrees>.001)failures.push('Post-solve correction changed the downstream pose');
  if(I.shaderErrors.length)failures.push('Shader error');
  const report={synthetic,summary,baselineCompared:!!before,before:before?.summary??null,maxPointErrorM:maxPointError,maxHandOrBladeErrorDegrees:maxOrientationError,controllerStats:R.upperRoll.stats,failures,shaderErrors:I.shaderErrors};
  await save('upper-roll-check.json',report);return JSON.stringify(report,null,2);
}
