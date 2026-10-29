import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedTwistTarget,stepSkinTwist} from './twist_math.mjs';
const rad=Math.PI/180,axis=[0,1,0],q=degrees=>[0,Math.sin(degrees*rad/2),0,Math.cos(degrees*rad/2)];
test('out-of-range branch crossings cannot add turns to the skin',()=>{
 let angle=0,target=0;
 for(let n=0;n<6000;n++){
  const degrees=n<4500?n*.7:0;
  const quaternion=q(degrees).map(x=>n%2?-x:x);
  target=boundedTwistTarget(quaternion,axis,target,85*rad);
  const previous=angle;angle=stepSkinTwist(angle,target,.004,85*rad);
  assert.ok(Math.abs(angle)<=85*rad+1e-12);
  assert.ok(Math.abs(angle-previous)<=450*rad*.004+1e-12);
  assert.equal(stepSkinTwist(angle,target,0,85*rad),angle);
 }
 assert.ok(Math.abs(angle)<1e-8,'rest pose must not retain a complete-turn winding');
});
test('the same anatomical stop survives the quaternion +/-180 seam',()=>{
 let target=80*rad;
 for(const degrees of [160,179,181,200,260]){target=boundedTwistTarget(q(degrees),axis,target,85*rad);assert.equal(target,85*rad);}
 assert.ok(boundedTwistTarget(q(-50),axis,target,85*rad)<0,'return through the valid interval');
});
