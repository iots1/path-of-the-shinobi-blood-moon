import * as THREE from 'three';
import {createTwistSkinning} from '../rig/twist_skinning.js';

export async function checkTwist(){
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  // Exercise an arbitrarily oriented imported bind frame; the axial direction
  // deliberately differs from local Y, as it does in the game's Mixamo nodes.
  const root=new THREE.Group(),up=new THREE.Bone(),fo=new THREE.Bone(),ha=new THREE.Bone();
  root.add(up);up.add(fo);fo.add(ha);up.name='LeftArm';fo.name='LeftForeArm';ha.name='LeftHand';
  fo.position.set(.2,.04,.03);ha.position.set(.19,-.02,.01);
  up.quaternion.setFromEuler(new THREE.Euler(.3,-.4,.2));fo.quaternion.setFromEuler(new THREE.Euler(-.2,.1,.5));
  const bones=[up,fo,ha],map={LeftArm:up,LeftForeArm:fo,LeftHand:ha},bind={LeftArm:{q:up.quaternion.clone()},LeftForeArm:{q:fo.quaternion.clone()}};
  for(const [part,parent] of [['Arm',up],['ForeArm',fo]])for(let k=1;k<=3;k++){const b=new THREE.Bone();b.name='Left'+part+'Twist'+k;parent.add(b);bones.push(b);map[b.name]=b;}
  root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones),real={bone:map,bind,arm:{L:{up,fo,ha,upDir:fo.position.clone().normalize(),foDir:ha.position.clone().normalize()},R:{up:{},fo:{},upDir:new THREE.Vector3(0,1,0),foDir:new THREE.Vector3(0,1,0)}}};
  const state=createTwistSkinning({skeleton},real);
  const axis=fo.position.clone().normalize(),swing=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(axis,new THREE.Vector3(0,0,1)).normalize(),.8);
  let cases=0;
  for(const angle of [0,.5,1.3,3.13,3.15,3.5,0,-.5,-1.3]){
    up.quaternion.copy(bind.LeftArm.q).multiply(swing).multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
    root.updateMatrixWorld(true);
    const wrist=ha.getWorldPosition(new THREE.Vector3()),before=up.quaternion.clone();
    for(let k=0;k<200;k++){state.advance(.004);state.update();}skeleton.update();
    assert(state.snapshot().every(s=>Math.abs(s.rollDegrees)<=s.limitDegrees+1e-6),'Skin twist escaped its anatomical interval');
    assert(state.stats.maxRateDegrees<=450.0001,'Skin twist exceeded its slew limit');
    assert(up.quaternion.equals(before),'Skin update changed solver quaternion');
    assert(ha.getWorldPosition(new THREE.Vector3()).distanceTo(wrist)<1e-12,'Skin update moved wrist');
    assert(state.snapshot().every(s=>s.finite&&s.fullRollMatrixError<1e-10),'Full-roll station differs from solved transform');
    const s=state.segments[0],q0=new THREE.Quaternion(),qi=new THREE.Quaternion();
    s.proxies[0].matrixWorld.decompose(new THREE.Vector3(),q0,new THREE.Vector3());
    for(let k=1;k<4;k++){
      s.proxies[k].matrixWorld.decompose(new THREE.Vector3(),qi,new THREE.Vector3());
      const expected=q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis,s.angle*k/3));
      assert(qi.angleTo(expected)<1e-6,'Wrong fractional twist station');
    }
    const matrices=skeleton.boneMatrices.slice();state.update();skeleton.update();
    assert(matrices.every((v,i)=>Math.abs(v-skeleton.boneMatrices[i])<1e-6),'Repeated updates accumulate twist');
    cases++;
  }
  while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
  const I=window.__iso;
  I.stop();I.frame(0,0);
  const active=I.rig.real;
  assert(active.twist.segments.length===4,'Game did not load all four twist segments');
  assert(active.modelSource.includes('ninja-anatomical-preview.glb'),'Game is using the old model');
  const traces=[];
  for(const mode of ['walk','run','atk1','dual']){
    I.loop(mode);
    let maxMatrixError=0,nonFinite=0,maxRollStep=0,peak=null,maxAbsRoll=0;
    let previous=null,previousQ=null;
    for(let time=0;time<3200;time+=4){
      I.frame(0,4,true);active.skinning.update();
      const data=active.twist.snapshot();
      maxAbsRoll=Math.max(maxAbsRoll,...data.map(x=>Math.abs(x.rollDegrees)));
      maxMatrixError=Math.max(maxMatrixError,...data.map(x=>x.fullRollMatrixError));
      nonFinite+=data.filter(x=>!x.finite).length;
      if(previous)for(let i=0;i<data.length;i++){
        const step=Math.abs(data[i].rollDegrees-previous[i].rollDegrees);
        if(step>maxRollStep){maxRollStep=step;peak={time,...data[i],previousDegrees:previous[i].rollDegrees,solverQuaternionStepDegrees:previousQ[i].angleTo(active.twist.segments[i].source.quaternion)*180/Math.PI};}
      }
      previous=data;
      previousQ=active.twist.segments.map(s=>s.source.quaternion.clone());
    }
    assert(!nonFinite&&maxMatrixError<1e-8,'Invalid twist transforms in '+mode);
    assert(maxAbsRoll<=90.0001&&maxRollStep<=1.8001,'Unbounded skin winding in '+mode);
    traces.push({mode,frames:800,nonFinite,fullRollMatrixError:maxMatrixError,maxRollStepDegrees:maxRollStep,maxAbsRollDegrees:maxAbsRoll,peak});
    I.loop('off');
  }
  I.frame(0,0);
  assert(!I.shaderErrors.length,'Renderer reported a shader error');
  assert(!active.skinning.unsupportedScale,'Twist skinning introduced a non-rigid transform');
  const report={syntheticCases:cases,gameModel:active.modelSource,skinJoints:active.model.getObjectByProperty('isSkinnedMesh',true).skeleton.bones.length,segments:4,traces,shaderErrors:I.shaderErrors,rigidSkinning:!active.skinning.unsupportedScale,failures:0};
  await fetch('/debug/save?name=twist-check.json',{method:'POST',body:JSON.stringify(report,null,2)});
  return JSON.stringify(report,null,2);
}
