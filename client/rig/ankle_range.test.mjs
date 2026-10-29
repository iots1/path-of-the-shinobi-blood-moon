import test from 'node:test';
import assert from 'node:assert/strict';
import {anklePitchCorrection} from './ankle_range.mjs';
test('neutral shoe and ordinary stance need no correction',()=>{
 for(const a of [-50,-20,0,12,20]){const r=a*Math.PI/180;assert.ok(Math.abs(anklePitchCorrection([0,Math.cos(r),Math.sin(r)]))<1e-12);}
});
test('a lunging tibia raises the heel to retain the ankle envelope',()=>{
 for(const a of [-85,-60,30,72]){
  const r=a*Math.PI/180,theta=anklePitchCorrection([.2,Math.cos(r),Math.sin(r)]);
  const y=Math.cos(theta)*Math.cos(r)+Math.sin(theta)*Math.sin(r),z=-Math.sin(theta)*Math.cos(r)+Math.cos(theta)*Math.sin(r);
  const final=Math.atan2(z,y)*180/Math.PI;
  assert.ok(Math.abs(final-Math.max(-50,Math.min(20,a)))<1e-10);
 }
});
