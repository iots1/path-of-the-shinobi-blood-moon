import * as THREE from 'three';
import {anklePitchCorrection} from './ankle_range.mjs';
// A floor-flat foot is a preference, not permission to fold the ankle beyond
// its range. Let the heel rise; keep the forefoot orientation at toe-off.
export function constrainAnkles(real){
 for(const side of ['Left','Right']){
  const b=real.bone,foot=b[side+'Foot'],toe=b[side+'ToeBase'];
  const fq=foot.getWorldQuaternion(new THREE.Quaternion()),sole=fq.clone().multiply(real.bind[side+'Foot'].rl.clone().invert()).multiply(real.soleYaw[side]);
  const tibia=b[side+'Leg'].getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(sole.clone().invert());
  const theta=anklePitchCorrection(tibia.toArray());
  if(Math.abs(theta)<1e-8)continue;
  const toeQ=toe.getWorldQuaternion(new THREE.Quaternion());
  const wanted=sole.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),theta)).multiply(real.soleYaw[side].clone().invert()).multiply(real.bind[side+'Foot'].rl);
  foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(wanted).normalize();foot.updateMatrixWorld(true);
  toe.quaternion.copy(foot.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(toeQ).normalize();toe.updateMatrixWorld(true);
 }
}
