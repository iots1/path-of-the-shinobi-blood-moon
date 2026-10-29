import * as THREE from 'three';
import {twistAngle,boundedTwistTarget,stepSkinTwist} from './twist_math.mjs';

// Keep the solver's bones intact: it reads its previous arm rotations for grip
// continuity. Skin-only proxy joints receive swing + a fraction of axial roll.
// The original forearm/hand still inherit full parent roll, so IK endpoints,
// fingers, swords and accessory anchors retain their solved world transforms.
export function createTwistSkinning(mesh,real){
  const skeleton=mesh.skeleton,segments=[];
  const makeProxy=(source,index)=>{
    const proxy=new THREE.Bone();proxy.name=source.name;proxy.matrixAutoUpdate=false;
    proxy.matrix.copy(source.matrixWorld);proxy.matrixWorld.copy(source.matrixWorld);
    skeleton.bones[index]=proxy;return proxy;
  };
  const definitions=[];
  for(const [side,label] of [['L','Left'],['R','Right']]){
    const arm=real.arm[side];
    for(const [part,source,axis] of [['Arm',arm.up,arm.upDir],['ForeArm',arm.fo,arm.foDir]]){
      const helpers=[1,2,3].map(k=>real.bone[label+part+'Twist'+k]);
      if(helpers.every(b=>!b))continue; // legacy 70-joint comparison assets
      if(helpers.some(b=>!b))throw new Error('Incomplete twist chain: '+label+part);
      const joints=[source,...helpers],indices=joints.map(b=>skeleton.bones.indexOf(b));
      if(indices.some(i=>i<0))throw new Error('Twist joint missing from skin: '+label+part);
      definitions.push({side,part,source,axis:axis.clone().normalize(),joints,indices});
    }
  }
  for(const d of definitions){
    const bind=real.bind[d.side==='L'?'Left'+d.part:'Right'+d.part].q.clone();
    segments.push({...d,bind,inverseBind:bind.clone().invert(),angle:0,target:0,rawAngle:0,limit:(d.part==='Arm'?90:85)*Math.PI/180,
      proxies:d.joints.map((b,i)=>makeProxy(b,d.indices[i]))});
  }
  const delta=new THREE.Quaternion(),twist=new THREE.Quaternion(),rotation=new THREE.Quaternion();
  const local=new THREE.Matrix4(),world=new THREE.Matrix4();
  const stats={samples:0,maxRollStepDegrees:0,maxRateDegrees:0,maxUpperDegrees:0,maxForeDegrees:0};
  const readTarget=segment=>{
    delta.copy(segment.inverseBind).multiply(segment.source.quaternion).normalize();
    segment.rawAngle=twistAngle(delta.toArray(),segment.axis.toArray(),0);
    segment.target=boundedTwistTarget(delta.toArray(),segment.axis.toArray(),segment.target,segment.limit);
  };
  const state={enabled:segments.length>0,segments,stats,advance(dt){
    // Exactly once per physics step. Rendering/CPU surface queries must not
    // advance the filter or wind a sleeve while the game is paused.
    for(const s of segments){
      readTarget(s);const previous=s.angle;s.angle=stepSkinTwist(previous,s.target,dt,s.limit);
      const step=Math.abs(s.angle-previous)*180/Math.PI;
      stats.samples++;stats.maxRollStepDegrees=Math.max(stats.maxRollStepDegrees,step);
      stats.maxRateDegrees=Math.max(stats.maxRateDegrees,dt>0?step/dt:0);
      const key=s.part==='Arm'?'maxUpperDegrees':'maxForeDegrees';stats[key]=Math.max(stats[key],Math.abs(s.angle)*180/Math.PI);
    }
  },update(){
    for(const segment of segments){
      const {source,axis,proxies}=segment;
      // The source quaternion retains the complete solved orientation. Only
      // the twist gradient over the skin is bounded; the full-roll station
      // still equals the source, so wrists and sword grips stay exact.
      // Remove the bounded distributed component at the proximal station,
      // then restore 0, 1/3, 2/3, 1 along the segment. Any residual stays
      // common to the segment instead of winding multiple turns over skin.
      for(let i=0;i<4;i++){
        twist.setFromAxisAngle(axis,segment.angle*(i/3-1));
        rotation.copy(source.quaternion).multiply(twist);
        local.compose(source.position,rotation,source.scale);
        world.multiplyMatrices(source.parent.matrixWorld,local);
        proxies[i].matrix.copy(world);proxies[i].matrixWorld.copy(world);
      }
    }
  },snapshot(){
    return segments.map(s=>({side:s.side,part:s.part,rollDegrees:s.angle*180/Math.PI,rawRollDegrees:s.rawAngle*180/Math.PI,limitDegrees:s.limit*180/Math.PI,
      fractions:[0,1/3,2/3,1],fullRollMatrixError:Math.max(...s.proxies[3].matrixWorld.elements.map((v,i)=>Math.abs(v-s.source.matrixWorld.elements[i]))),
      finite:s.proxies.every(p=>p.matrixWorld.elements.every(Number.isFinite))}));
  }};
  return state;
}
