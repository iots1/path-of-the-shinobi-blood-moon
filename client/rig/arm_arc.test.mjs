import test from 'node:test';
import assert from 'node:assert/strict';
import {radialReachArc} from './arm_arc.mjs';
const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-12);
test('reverse release arc retains endpoints and interpolated shoulder reach',()=>{
 const a=[-.25,-.1,.25],b=[.05,.15,-.2];close(radialReachArc(a,b,0),a);close(radialReachArc(a,b,1),b);
 for(let i=0;i<=100;i++){const t=i/100,k=t*t*(3-2*t),p=radialReachArc(a,b,t);assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...p)-(Math.hypot(...a)*(1-k)+Math.hypot(...b)*k))<1e-12);}
 assert.ok(radialReachArc(a,b,.5)[0]>.1,'approach should pass outside the shoulder');
});
test('opposed directions and zero reach stay finite',()=>{
 for(const a of [[0,0,0],[0,-.3,0]])for(const b of [[0,0,0],[0,.3,0]])for(let i=0;i<100;i++)assert.ok(radialReachArc(a,b,i/100).every(Number.isFinite));
});
test('spherical reach stays continuous through opposed shoulder directions',()=>{
 for(const [a,b] of [[[0,-.3,0],[0,.3,0]],[[-.25,-.1,.25],[.05,.15,-.2]],[[.3,0,0],[-.3,0,0]]]){
  let prev=radialReachArc(a,b,0);
  for(let i=1;i<=1000;i++){
   const point=radialReachArc(a,b,i/1000),dot=point.reduce((n,v,j)=>n+v*prev[j],0)/(Math.hypot(...point)*Math.hypot(...prev));
   assert.ok(Math.acos(Math.max(-1,Math.min(1,dot)))<Math.PI/180,'no direction flip between adjacent reach phases');prev=point;
  }
 }
});
