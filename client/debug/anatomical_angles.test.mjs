import test from 'node:test';
import assert from 'node:assert/strict';
import {shoulderDirection,hingeDirection,rangeExcess} from './anatomical_angles.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('anatomical zero and mirrored T poses have the same shoulder elevation',()=>{
  for(const side of [-1,1]){
    const zero=shoulderDirection([0,-1,0],side);close(zero.elevation,0);assert.equal(zero.plane,null);
    const t=shoulderDirection([side,0,0],side);close(t.elevation,90);close(t.plane,0);
    const front=shoulderDirection([0,0,1],side);close(front.elevation,90);close(front.plane,90);close(front.extension,0);
    close(shoulderDirection([0,0,-1],side).extension,90);
    assert.equal(shoulderDirection([0,1,0],side).plane,null);
  }
});
test('carrying angle is not counted as elbow flexion, and knee bend has the opposite sign',()=>{
  const c=17*Math.PI/180;
  close(hingeDirection([Math.sin(c),Math.cos(c),0]).flexion,0);
  close(hingeDirection([Math.sin(c),Math.cos(c),0]).offPlane,17);
  close(hingeDirection([0,0,1]).flexion,90);
  close(hingeDirection([0,0,-1],-1).flexion,90);
  assert.ok(hingeDirection([0,1,-.1]).flexion<0);
  assert.equal(rangeExcess(NaN,[0,150]),Infinity);
});
