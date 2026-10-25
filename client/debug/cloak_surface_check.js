// Dev-only collision-surface audit. Fresh game load, then await run().
// CPU-mirrors the cloak's displayed vertex deformation; the source arrays stay intact.
import * as THREE from 'three';
import {shoulderTrace} from './motion_check.js';

function audit(I){
  const cloak=I.rig.real.equipmentCloak,point=new THREE.Vector3(),raw=new THREE.Vector3();
  I.frame(0,0);cloak.prepareRender();
  const capsules=cloak.collisionCapsules().map(c=>({...c,axis:c.b.clone().sub(c.a)}));
  let finite=true,count=0;const before={},after={};
  for(const mesh of cloak.meshes){
    for(let i=0;i<mesh.geometry.attributes.position.count;i+=17){
      raw.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,raw);raw.applyMatrix4(mesh.matrixWorld);
      cloak.getVertexPosition(mesh,i,point).applyMatrix4(mesh.matrixWorld);count++;
      finite&&=Number.isFinite(point.x+point.y+point.z);
      for(const c of capsules){
        const depth=p=>{
          const t=THREE.MathUtils.clamp(((p.x-c.a.x)*c.axis.x+(p.y-c.a.y)*c.axis.y+(p.z-c.a.z)*c.axis.z)/Math.max(1e-8,c.axis.lengthSq()),0,1);
          const dx=p.x-c.a.x-c.axis.x*t,dy=p.y-c.a.y-c.axis.y*t,dz=p.z-c.a.z-c.axis.z*t;
          return THREE.MathUtils.lerp(c.r,c.r1,t)-Math.hypot(dx,dy,dz);
        };
        before[c.name]=Math.max(before[c.name]||0,depth(raw));after[c.name]=Math.max(after[c.name]||0,depth(point));
      }
    }
  }
  const mm=values=>Object.fromEntries(Object.entries(values).map(([key,value])=>[key,+(value*1000).toFixed(2)]));
  return {samples:count,finite,beforeDepthMm:mm(before),afterDepthMm:mm(after),residualDepthMm:+(Math.max(0,...Object.values(after))*1000).toFixed(2)};
}
export async function run({save=true}={}){
  const I=window.__iso;await I.rig.real.equipmentCloak.ready;
  if(!I.rig.real.equipmentCloak.getVertexPosition)throw new Error('Cloak collision surface accessor missing');
  const report={at:new Date().toISOString(),scenarios:{},note:'Sampled displayed cloth vertices versus sleeve/sword capsules including their cloth margin, not exact body triangles or a full self-collision certificate.'};
  for(const [name,options] of Object.entries({idle:{until:1500,runMs:0},walk:{until:1000,runMs:2000,shift:true},run:{until:1000,runMs:2000},combo:{until:1000,runMs:0,presses:[0,420,860]},dual:{until:1480,runMs:0,presses:[0,340],fn:'pressK'}})){
    await shoulderTrace(options);I.setCloak(true);report.scenarios[name]=audit(I);
  }
  if(save)await fetch('/debug/save?name=cloak-surface-check.json',{method:'POST',body:JSON.stringify(report,null,2)});
  console.log('CLOAK SURFACE CHECK',report);return report;
}
