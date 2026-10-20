import assert from 'node:assert/strict';
import {encodeRigidTransform,transformBlendedPoint} from '../client/rig/volume_skinning_math.mjs';
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6,`${a} != ${b}`));
const r=new Float32Array(8),d=new Float32Array(8),s=Math.SQRT1_2;
encodeRigidTransform({x:2,y:3,z:4},{x:0,y:0,z:s,w:s},r,d,0);
near(transformBlendedPoint(r,d,[0,0,0,0],[1,0,0,0],[1,0,0]),[2,4,4]);
// Opposing 90° bone twists collapse an LBS ring to its axis; DQ must retain its radius.
encodeRigidTransform({x:0,y:0,z:0},{x:0,y:0,z:s,w:s},r,d,0);
encodeRigidTransform({x:0,y:0,z:0},{x:0,y:0,z:-s,w:s},r,d,4);
for(let i=0;i<16;i++){
 const p=[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8),.5];
 const out=transformBlendedPoint(r,d,[0,1,0,0],[.5,.5,0,0],p);
 assert.ok(Math.abs(Math.hypot(out[0],out[1])-1)<1e-6);
}
// q and -q are the same orientation: blending them must not cancel the rotation.
encodeRigidTransform({x:2,y:3,z:4},{x:0,y:0,z:s,w:s},r,d,0);
encodeRigidTransform({x:2,y:3,z:4},{x:0,y:0,z:-s,w:-s},r,d,4);
near(transformBlendedPoint(r,d,[0,1,0,0],[.5,.5,0,0],[1,0,0]),[2,4,4]);
console.log('PASS: rigid rotation/translation, opposing-twist volume, quaternion hemisphere continuity');
