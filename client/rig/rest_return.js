import * as THREE from 'three';
import {returnReach,neutralPole} from './rest_return_math.mjs';
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
// Restore the known standing elbow plane and humeral roll through the existing
// IK. Do not independently lerp a supporting hand away from its sword.
export function createRestReturn(real,rig){
 const forward=new THREE.Vector3(0,0,1),up=new THREE.Vector3(0,1,0),u=new THREE.Vector3(),f=new THREE.Vector3();
 const state={weight:0,active:false,age:0,reference:null,seenAttack:false,S:null,
  save(S){
   const chestInv=rig.chest.getWorldQuaternion(new THREE.Quaternion()).invert(),reference={};
   for(const side of ['L','R']){
    const a=real.arm[side],sh=a.up.getWorldPosition(new THREE.Vector3()),el=a.fo.getWorldPosition(new THREE.Vector3()).sub(sh),wrist=a.ha.getWorldPosition(new THREE.Vector3()).sub(sh),pole=new THREE.Vector3(...neutralPole(el.toArray(),wrist.toArray()));
    reference[side]={upperChest:chestInv.clone().multiply(a.up.getWorldQuaternion(new THREE.Quaternion())).normalize(),elbow:el.applyQuaternion(chestInv).normalize(),pole:pole.applyQuaternion(chestInv),rho:S.rho?.[side]||0,palmReach:side==='R'?rig.katana.position.distanceTo(sh):0};
   }
   state.reference=reference;
  },
  prime(S){if(!state.reference&&!state.seenAttack&&!S.act&&S.walkAmt<.02&&real.arm.R.appliedPose)state.save(S);},
  update(dt,S,combo){
   state.S=S;if(S.act)state.seenAttack=true;
   const a=S.act,last=a?.def.keys?.at(-1)?.[0]??Infinity;
   const tail=a&&combo.includes(a.def)&&a.t>last+30&&!S.queued;
   const idle=!a&&S.phase==='idle'&&combo.includes(S.lastAct?.def);
   const target=state.reference&&S.walkAmt<.05&&(tail||idle)?1:0;
   state.active=!!target;
   state.weight=THREE.MathUtils.lerp(state.weight,target,1-Math.exp(-Math.max(0,dt)/(target?.22:.05)));
  },
  capture(dt,S){
   if(state.reference||state.seenAttack||S.act||S.walkAmt>.02||(S.twoEff||0)>.05)return;
   state.age+=Math.max(0,dt);if(state.age>.8)state.save(S);
  },
  weightFor(side){return state.weight*(side==='L'?1-smooth((state.S?.twoEff||0)/.3):1);},
  pole(side,value,chestQ){forward.set(0,0,1).applyQuaternion(chestQ);up.set(0,1,0).applyQuaternion(chestQ);const ref=state.reference?.[side];if(ref)value.lerp(ref.pole.clone().applyQuaternion(chestQ),state.weightFor(side)).normalize();return value;},
  bendCost(sh,el,wr){if(!state.active||state.weight<1e-5)return 0;u.copy(el).sub(sh).normalize();f.copy(wr).sub(el).normalize();const bend=f.dot(forward)-f.dot(u)*u.dot(forward),down=smooth((-u.dot(up)+.05)/.6);return 2000*state.weight*down*Math.max(0,.025-bend);},
  upperWeightFor(side){const a=real.arm[side],direction=a.upDir.clone().applyQuaternion(a.up.getWorldQuaternion(new THREE.Quaternion()));return state.weightFor(side)*smooth((-direction.dot(up)+.05)/.6);},
  rho(side,value){const ref=state.reference?.[side];return ref?value+Math.atan2(Math.sin(ref.rho-value),Math.cos(ref.rho-value))*state.weightFor(side):value;},
  reach(value){return state.reference?THREE.MathUtils.lerp(value,state.reference.R.palmReach,state.weight):value;},
  maxReach(arm){return returnReach(arm.l1,arm.l2,state.weight);},
  freeTarget(arm,sh,target){
   if(!state.active||(state.S.twoEff||0)>.5)return;
   const v=target.clone().sub(sh),d=v.length(),limit=state.maxReach(arm),free=1-smooth((state.S.twoEff||0)/.5);
   if(d>limit)target.copy(sh).addScaledVector(v,THREE.MathUtils.lerp(d,limit,free)/d);
   const p=rig.chest.worldToLocal(target.clone()),dd=Math.hypot(p.x/.21,(p.z-.04)/.22);
   if(p.y>-.55&&p.y<.2&&dd<1&&dd>.05){const k=THREE.MathUtils.lerp(1,1/dd,free);p.x*=k;p.z=.04+(p.z-.04)*k;target.copy(rig.chest.localToWorld(p));}
  },
  upperTarget(side,out=new THREE.Quaternion()){
   const a=real.arm[side],ref=state.reference[side],neutral=rig.chest.getWorldQuaternion(new THREE.Quaternion()).multiply(ref.upperChest),current=a.up.getWorldQuaternion(new THREE.Quaternion());
   const from=a.upDir.clone().applyQuaternion(neutral).normalize(),to=a.upDir.clone().applyQuaternion(current).normalize();
   neutral.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
   return out.copy(a.up.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(neutral).normalize();
  }
 };
 return state;
}
