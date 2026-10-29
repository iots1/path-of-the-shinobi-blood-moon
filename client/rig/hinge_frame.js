import * as THREE from 'three';
const euler=new THREE.Euler(0,0,0,'XZY');
const parent=new THREE.Quaternion(),q=new THREE.Quaternion(),rot=new THREE.Quaternion(),delta=new THREE.Quaternion();
const u=new THREE.Vector3(),f=new THREE.Vector3(),n=new THREE.Vector3(),current=new THREE.Vector3(),cross=new THREE.Vector3();
// The elbow is a hinge: upper-arm roll follows its actual bend plane. A
// separate axial smoothing correction must not turn it into a sideways hinge.
export function hingeFlexAngle(a,sh,el,wr){
 u.copy(el).sub(sh).normalize();f.copy(wr).sub(el).normalize();
 const c=a.hingeC??1,s=a.hingeS??0,r=Math.hypot(c,s),phi=Math.atan2(s,c),angle=Math.acos(THREE.MathUtils.clamp(u.dot(f)/Math.max(r,1e-8),-1,1));
 const choices=[phi+angle,phi-angle].map(x=>Math.atan2(Math.sin(x),Math.cos(x)));
 const error=x=>Math.max(0,-5*Math.PI/180-x,x-145*Math.PI/180);
 const reference=a.hingeFlexState;
 if(reference!=null&&Math.abs(error(choices[0])-error(choices[1]))<1e-6)return Math.abs(choices[0]-reference)<=Math.abs(choices[1]-reference)?choices[0]:choices[1];
 return error(choices[0])<=error(choices[1])?choices[0]:choices[1];
}
export function naturalUpperFrame(a,sh,el,wr,out=new THREE.Quaternion(),parentWorld=null){
 const flex=hingeFlexAngle(a,sh,el,wr);
 if(parentWorld)parent.copy(parentWorld);else a.up.parent.getWorldQuaternion(parent);q.copy(parent).multiply(a.upRest||a.up.quaternion);
 u.copy(el).sub(sh).normalize();f.copy(wr).sub(el).normalize();
 current.copy(a.upDir).applyQuaternion(q).normalize();rot.setFromUnitVectors(current,u);q.premultiply(rot);
 n.set(0,Math.cos(flex),Math.sin(flex));if(a.hingeFrame)n.applyQuaternion(a.hingeFrame);else n.copy(a.bendLocal);
 n.applyQuaternion(q);n.addScaledVector(u,-n.dot(u));f.addScaledVector(u,-f.dot(u));
 if(f.lengthSq()>1e-8&&n.lengthSq()>1e-8){f.normalize();n.normalize();const angle=Math.atan2(u.dot(cross.crossVectors(n,f)),n.dot(f));q.premultiply(rot.setFromAxisAngle(u,angle));}
 return out.copy(q).normalize();
}
export function hingeErrorDegrees(a,sh,el,wr){
 const flex=hingeFlexAngle(a,sh,el,wr);n.set(0,Math.cos(flex),Math.sin(flex)).applyQuaternion(a.hingeFrame).applyQuaternion(a.up.getWorldQuaternion(q));f.copy(wr).sub(el).normalize();return n.normalize().angleTo(f)*180/Math.PI;
}
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x))*180/Math.PI;
function controlAngles(a,world,parentWorld=null){
 if(parentWorld)parent.copy(parentWorld);else a.up.parent.getWorldQuaternion(parent);
 delta.copy(a.controlRestInverse).multiply(parent.invert()).multiply(world).multiply(a.controlAdapterInverse).normalize();euler.setFromQuaternion(delta,'XZY');
 const choices=[{flexion:euler.x*180/Math.PI,abduction:euler.z*180/Math.PI,roll:euler.y*180/Math.PI},
 {flexion:wrap(euler.x+Math.PI),abduction:(euler.z>=0?Math.PI-euler.z:-Math.PI-euler.z)*180/Math.PI,roll:wrap(euler.y+Math.PI)}];
 // XZY has infinitely many x/y representations when abduction is 90°.
 // Accept the stored control representation only after matching it to the
 // actual bone quaternion, so a gimbal convention cannot report false limits.
 if(Math.abs(euler.z)>89.9*Math.PI/180&&a.anatomicalControl){
   const c={...a.anatomicalControl},r=Math.PI/180,expected=new THREE.Quaternion().setFromEuler(new THREE.Euler(c.flexion*r,c.roll*r,c.abduction*r,'XZY'));
   if(delta.angleTo(expected)<.005*r)choices.push(c);
 }
 const excess=(v,lo,hi)=>Math.max(0,lo-v,v-hi);
 for(const c of choices)c.error=Math.hypot(excess(c.flexion,-120,145),excess(c.abduction,-100,100),excess(c.roll,-90,90));
 return choices.reduce((best,c)=>c.error<best.error?c:best,choices[0]);
}
export function naturalUpperTwistDegrees(a,sh,el,wr,parentWorld=null){
 naturalUpperFrame(a,sh,el,wr,q,parentWorld);
 if(a.controlRestInverse)return controlAngles(a,q,parentWorld).roll;
 if(parentWorld)parent.copy(parentWorld);else a.up.parent.getWorldQuaternion(parent);
 delta.copy(a.upRest).invert().multiply(parent.invert()).multiply(q).normalize();
 const angle=2*Math.atan2(delta.x*a.upDir.x+delta.y*a.upDir.y+delta.z*a.upDir.z,delta.w);
 return Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI;
}
export function naturalUpperConstraintError(a,sh,el,wr,parentWorld=null){naturalUpperFrame(a,sh,el,wr,q,parentWorld);return a.controlRestInverse?controlAngles(a,q,parentWorld).error:0;}
export function upperControlAngles(a){a.up.getWorldQuaternion(q);return controlAngles(a,q);}

export function foreControlAngles(a){
 a.fo.getWorldQuaternion(q);a.up.getWorldQuaternion(parent);delta.copy(a.foreControlRestInverse).multiply(parent.invert()).multiply(q).multiply(a.foreControlAdapterInverse).normalize();euler.setFromQuaternion(delta,'XYZ');
 return {flexion:euler.x*180/Math.PI,roll:euler.y*180/Math.PI,side:euler.z*180/Math.PI};
}

// Project unreachable IK preferences onto the authoring shoulder limits. The
// sword follows the solved fist, so this never slides its local grip point.
export function constrainUpperFrame(a,world,dt=0){
 const c=controlAngles(a,world);
 const target={flexion:THREE.MathUtils.clamp(c.flexion,-120,145),abduction:THREE.MathUtils.clamp(c.abduction,-100,100),roll:THREE.MathUtils.clamp(c.roll,-90,90)};
 if(!a.anatomicalControl||!a.anatomicalActive)a.anatomicalControl=upperControlAngles(a);
 a.anatomicalActive=true;
 for(const k of ['flexion','abduction','roll']){const from=a.anatomicalControl[k],step=THREE.MathUtils.clamp(target[k]-from,-600*dt,600*dt);a.anatomicalControl[k]=THREE.MathUtils.clamp(from+step,k==='flexion'?-120:k==='abduction'?-100:-90,k==='flexion'?145:k==='abduction'?100:90);}
 Object.assign(c,a.anatomicalControl);
 const rad=Math.PI/180,clamp=THREE.MathUtils.clamp;
 const bounded=new THREE.Quaternion().setFromEuler(new THREE.Euler(clamp(c.flexion,-120,145)*rad,clamp(c.roll,-90,90)*rad,clamp(c.abduction,-100,100)*rad,'XZY'));
 return world.copy(a.up.parent.getWorldQuaternion(new THREE.Quaternion())).multiply(a.controlRestInverse.clone().invert()).multiply(bounded).multiply(a.controlAdapterInverse.clone().invert()).normalize();
}
