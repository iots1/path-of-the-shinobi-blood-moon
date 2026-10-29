import test from 'node:test';
import assert from 'node:assert/strict';
import {returnReach,neutralPole} from './rest_return_math.mjs';
test('neutral pole reconstructs the measured elbow on its IK circle',()=>{
 const e=[.05,-.22,-.04],w=[.11,-.44,.07],pole=neutralPole(e,w),l1=Math.hypot(...e),l2=Math.hypot(...w.map((x,i)=>x-e[i])),d=Math.hypot(...w),axis=w.map(x=>x/d),c=(l1*l1+d*d-l2*l2)/(2*l1*d);
 assert.ok(Math.abs(pole.reduce((s,x,i)=>s+x*axis[i],0))<1e-12);
 const solved=axis.map((x,i)=>x*l1*c+pole[i]*l1*Math.sqrt(1-c*c));assert.ok(Math.hypot(...solved.map((x,i)=>x-e[i]))<1e-12);
});
test('return permits a soft elbow fold and restores the same standing reach',()=>{
 const l1=.21,l2=.24,base=l1+l2-.005;
 assert.equal(returnReach(l1,l2,0),base);assert.equal(returnReach(l1,l2,1),base);
 const mid=returnReach(l1,l2,.5),interior=Math.acos((l1*l1+l2*l2-mid*mid)/(2*l1*l2))*180/Math.PI;assert.ok(Math.abs(interior-135)<1e-10);
 for(let i=0;i<=100;i++)assert.ok(returnReach(l1,l2,i/100)>=mid&&returnReach(l1,l2,i/100)<=base);
});
