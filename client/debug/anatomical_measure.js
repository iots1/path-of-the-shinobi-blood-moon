import * as THREE from 'three';
import {shoulderDirection,hingeDirection} from './anatomical_angles.mjs';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion(),D=180/Math.PI;
const frame=y=>{const z=V(0,0,1).addScaledVector(y,-y.z).normalize(),x=V().crossVectors(y,z).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
const twist=(q,axis)=>{const p=q.x*axis.x+q.y*axis.y+q.z*axis.z;if(Math.hypot(p,q.w)<1e-5)return null;const a=2*Math.atan2(p,q.w);return Math.atan2(Math.sin(a),Math.cos(a))*D;};

// Virtual measurement frames derived from the retained bind and landmarks.
// No bones are moved, no animation is used as the zero, and no skin is edited.
// This is a game-rig approximation, not an ISB clinical landmark measurement.
export function createAnatomicalMeasure(I){
  const R=I.rig.real,b=R.bone,bind=R.bind;
  const world=n=>b[n].getWorldQuaternion(Q()).normalize();
  const delta=n=>world(n).multiply(bind[n].rl.clone().invert()).normalize();
  const position=n=>b[n].getWorldPosition(V());
  const arms={},legs={};
  for(const [s,label] of [['L','Left'],['R','Right']]){
    const a=R.arm[s],upBind=bind[label+'Arm'].rl;
    const bindDirection=a.upDir.clone().applyQuaternion(upBind).normalize();
    const upFrame=frame(bindDirection),foreBind=a.foDir.clone().applyQuaternion(bind[label+'ForeArm'].rl).normalize();
    const palm=V(s==='L'?1:-1,0,0).applyQuaternion(bind[label+'Hand'].rl).normalize();
    arms[s]={adapter:upBind.clone().invert().multiply(upFrame),neutralInverse:frame(V(0,-1,0)).invert(),
      palmLocal:palm.applyQuaternion(bind[label+'ForeArm'].rl.clone().invert()),
      bindElbow:hingeDirection(foreBind.applyQuaternion(upFrame.clone().invert()).toArray())};
    const thighBind=b[label+'Leg'].position.clone().applyQuaternion(bind[label+'UpLeg'].rl).normalize();
    const calfBind=b[label+'Foot'].position.clone().applyQuaternion(bind[label+'Leg'].rl).normalize();
    legs[s]={hingeAdapter:bind[label+'UpLeg'].rl.clone().invert().multiply(frame(thighBind)),
      bindKnee:hingeDirection(calfBind.applyQuaternion(frame(thighBind).invert()).toArray(),-1),
      neutralInverse:R.corr[label+'UpLeg'].clone().invert()};
  }
  return {calibration:{method:'virtual-neutral-v2',units:'degrees',zero:'upright, arms down; bind carrying angle retained',
    axes:'+X character left, +Y up, +Z forward',
    shoulder:'humerothoracic direction plus neutral swing/twist proxy; not isolated glenohumeral RoM',
    elbow:'upper-arm long axis / anterior plane; sagittal bind prebend is measured, not zeroed; hinge alignment recorded separately',
    knee:'thigh long axis / anterior plane; sagittal bind prebend is measured, not zeroed',
    neck:'Head relative to upper thorax, combined cervical proxy',spine:'upper thorax relative to pelvis, combined spinal proxy',
    ankle:'actual tibia direction in the bind-flat shoe frame; shoe proxy',
    limitations:['No scapular landmarks: clavicle is not a complete scapula model.','No radius/ulna landmarks: forearm rotation uses a virtual palm frame.','Axial shoulder twist is undefined at a 180-degree swing.','RoM is a reference envelope, not proof of natural motion or a clinical injury threshold.'],
    arms:Object.fromEntries(['L','R'].map(s=>[s,{bindDirection:R.arm[s].upDir.clone().applyQuaternion(bind[(s==='L'?'Left':'Right')+'Arm'].rl).toArray(),bindElbow:arms[s].bindElbow}])),
    legs:Object.fromEntries(['L','R'].map(s=>[s,{bindKnee:legs[s].bindKnee}]))},
    sample(){
      const thorax=delta('Spine'),pelvis=delta('Hips'),head=delta('Head'),values={},nullable=[];
      const rotation=(name,q)=>{const e=new THREE.Euler().setFromQuaternion(q,'YXZ');values[name+'.flexion']=e.x*D;values[name+'.lateral']=-e.z*D;values[name+'.rotation']=e.y*D;};
      rotation('neck',thorax.clone().invert().multiply(head));rotation('spine',pelvis.clone().invert().multiply(thorax));
      for(const [s,label,sign] of [['L','Left',1],['R','Right',-1]]){
        const a=R.arm[s],sh=position(label+'Arm'),el=position(label+'ForeArm'),wr=position(label+'Hand');
        const direction=el.clone().sub(sh).normalize().applyQuaternion(thorax.clone().invert());
        const shoulder=shoulderDirection(direction.toArray(),sign);
        for(const key of ['elevation','extension','crossBody'])values[s+'.shoulder.'+key]=shoulder[key];
        const sq=thorax.clone().invert().multiply(world(label+'Arm')).multiply(arms[s].adapter).multiply(arms[s].neutralInverse).normalize();
        const axial=twist(sq,V(0,-1,0));
        if(axial===null)nullable.push(s+'.shoulder.axial');else values[s+'.shoulder.axial']=sign*axial;
        const hinge=world(label+'Arm').multiply(a.hingeFrame),f=wr.clone().sub(el).normalize().applyQuaternion(hinge.clone().invert());
        const elbow=hingeDirection(f.toArray()),upperFrame=world(label+'Arm').multiply(arms[s].adapter),physicalFore=wr.clone().sub(el).normalize().applyQuaternion(upperFrame.invert());
        values[s+'.elbow.flexion']=hingeDirection(physicalFore.toArray()).flexion;
        values[s+'.elbow.hingeFlexion']=elbow.flexion;values[s+'.elbow.offPlane']=elbow.offPlane;
        const fq=hinge.clone().multiply(Q().setFromAxisAngle(V(1,0,0),elbow.flexion/D)).invert().multiply(world(label+'ForeArm')).multiply(a.foreAdapter.clone().invert());
        const controlRoll=twist(fq,V(0,1,0));if(controlRoll===null)nullable.push(s+'.forearm.controlRoll');else values[s+'.forearm.controlRoll']=controlRoll;
        const foreDirection=wr.clone().sub(el).normalize(),referencePalm=V(0,0,1).applyQuaternion(hinge.clone().multiply(Q().setFromAxisAngle(V(1,0,0),elbow.flexion/D))),actualPalm=arms[s].palmLocal.clone().applyQuaternion(world(label+'ForeArm'));
        referencePalm.addScaledVector(foreDirection,-referencePalm.dot(foreDirection)).normalize();actualPalm.addScaledVector(foreDirection,-actualPalm.dot(foreDirection)).normalize();
        values[s+'.forearm.pronation']=sign*Math.atan2(foreDirection.dot(V().crossVectors(referencePalm,actualPalm)),referencePalm.dot(actualPalm))*D;
        const fh=wr.clone().sub(el).normalize().applyQuaternion(world(label+'Hand').invert()),palm=s==='R'?-1:1;
        const bend=Math.acos(THREE.MathUtils.clamp(fh.y,-1,1)),phi=Math.atan2(-fh.z,-palm*fh.x);
        values[s+'.wrist.flexion']=bend*Math.cos(phi)*D;values[s+'.wrist.radial']=bend*Math.sin(phi)*D;
        const hipQ=pelvis.clone().invert().multiply(delta(label+'UpLeg')).multiply(legs[s].neutralInverse),hd=V(0,-1,0).applyQuaternion(hipQ);
        values[s+'.hip.flexion']=Math.atan2(hd.z,-hd.y)*D;values[s+'.hip.abduction']=sign*Math.asin(THREE.MathUtils.clamp(hd.x,-1,1))*D;
        const hipAxial=twist(hipQ,V(0,-1,0));if(hipAxial===null)nullable.push(s+'.hip.rotation');else values[s+'.hip.rotation']=sign*hipAxial;
        const hip=position(label+'UpLeg'),knee=position(label+'Leg'),ankle=position(label+'Foot');
        const kf=world(label+'UpLeg').multiply(legs[s].hingeAdapter),kfdir=ankle.clone().sub(knee).normalize().applyQuaternion(kf.invert()),ka=hingeDirection(kfdir.toArray(),-1);
        values[s+'.knee.flexion']=ka.flexion;values[s+'.knee.offPlane']=ka.offPlane;
        const sole=delta(label+'Foot').multiply(R.soleYaw[label]),tibia=knee.clone().sub(ankle).normalize().applyQuaternion(sole.clone().invert());
        values[s+'.ankle.dorsiflexion']=Math.atan2(tibia.z,tibia.y)*D;
        values[s+'.ankle.bank']=Math.atan2(tibia.x,Math.hypot(tibia.y,tibia.z))*D;
        // Actual geometric knee angle, independent of hinge calibration.
        values[s+'.knee.interior']=hip.sub(knee).angleTo(ankle.sub(knee))*D;
      }
      return {values,nullable};
    }};
}
