import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRigidTransform,transformBlendedPoint} from './volume_skinning_math.mjs';

const poses=[170,-160,40,-30].map((degrees,i)=>{
  const t=degrees*Math.PI/360;
  return {p:{x:i*.02,y:i*.01,z:-i*.03},q:{x:0,y:0,z:Math.sin(t),w:Math.cos(t)}};
});
function palette(signMask=0){
  const real=new Float64Array(16),dual=new Float64Array(16);
  poses.forEach(({p,q},i)=>{const sign=signMask&(1<<i)?-1:1;encodeRigidTransform(p,{x:q.x*sign,y:q.y*sign,z:q.z*sign,w:q.w*sign},real,dual,i*4);});
  return {real,dual};
}
const permutations=a=>a.length===1?[a]:a.flatMap((x,i)=>permutations(a.filter((_,k)=>k!==i)).map(p=>[x,...p]));
const weights=[.62,.28,.10,0],point=[.2,1.3,-.1];
const close=(actual,expected)=>assert.ok(Math.hypot(...actual.map((v,i)=>v-expected[i]))<1e-12);
test('deformation is invariant to slot order, including a zero-weight first slot',()=>{
  const {real,dual}=palette();const expected=transformBlendedPoint(real,dual,[0,1,2,3],weights,point);
  for(const order of permutations([0,1,2,3]))close(transformBlendedPoint(real,dual,order,order.map(i=>weights[i]),point),expected);
});
test('quaternion sign changes preserve the same deformation',()=>{
  const original=palette();const expected=transformBlendedPoint(original.real,original.dual,[0,1,2,3],weights,point);
  for(let mask=0;mask<16;mask++){
    const {real,dual}=palette(mask);close(transformBlendedPoint(real,dual,[0,1,2,3],weights,point),expected);
  }
});
