// Dev-only full-source cloak fit check. Run on a fresh game load:
// const c=await import('/debug/cloak_check.js'); await c.run();
// Saves out/cloak-fit-check.json. Freezes the loop; reload to resume play.
import * as THREE from 'three';
import {shoulderTrace} from './motion_check.js';

function measure(I,mode){
  const root=I.rig.root,cloak=I.rig.real.equipmentCloak,katana=I.rig.katana;
  const inverse=root.matrixWorld.clone().invert(),v=new THREE.Vector3(),nearest=new THREE.Vector3();
  katana.updateMatrixWorld(true);
  const a=new THREE.Vector3(0,-.154,0).applyMatrix4(katana.matrixWorld).applyMatrix4(inverse);
  const b=new THREE.Vector3(0,.08,0).applyMatrix4(katana.matrixWorld).applyMatrix4(inverse);
  const axis=b.clone().sub(a),length2=axis.lengthSq();
  let body;
  I.rig.real.model.traverse(o=>{if(o.isSkinnedMesh && o.material.map)body=o;});
  const bodyMatrix=inverse.clone().multiply(body.matrixWorld),cells=new Map();
  const key=(x,y)=>Math.floor(x/.015)+','+Math.floor(y/.015);
  // Visible torso, not inflated bone capsules. A 15-mm XY raster is deliberately
  // conservative: use the furthest-back surface among neighbouring cells.
  for(let i=0;i<body.geometry.attributes.position.count;i++){
    v.fromBufferAttribute(body.geometry.attributes.position,i);
    body.applyBoneTransform(i,v);v.applyMatrix4(bodyMatrix);
    if(Math.abs(v.x)>.18 || v.y<.75 || v.y>1.46)continue;
    const k=key(v.x,v.y);cells.set(k,Math.min(cells.get(k)??9,v.z));
  }
  let handleGap=Infinity,finite=true,vertices=0,triangles=0;
  const gaps=[];let worst=null;
  for(const mesh of cloak.meshes){
    const position=mesh.geometry.attributes.position,matrix=inverse.clone().multiply(mesh.matrixWorld);
    vertices+=position.count;triangles+=(mesh.geometry.index?.count??position.count)/3;
    for(let i=0;i<position.count;i++){
      v.fromBufferAttribute(position,i);
      const rear=Math.abs(v.x)<=.14 && v.y>=.85 && v.y<=1.4 && v.z<=-.14;
      mesh.applyBoneTransform(i,v);v.applyMatrix4(matrix);
      finite&&=Number.isFinite(v.x+v.y+v.z);
      const along=THREE.MathUtils.clamp(((v.x-a.x)*axis.x+(v.y-a.y)*axis.y+(v.z-a.z)*axis.z)/length2,0,1);
      handleGap=Math.min(handleGap,v.distanceTo(nearest.copy(a).addScaledVector(axis,along)));
      if(!rear || Math.abs(v.x)>.15)continue;
      let back=9;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)back=Math.min(back,cells.get(key(v.x+dx*.015,v.y+dy*.015))??9);
      if(back<1){const gap=back-v.z;gaps.push(gap);if(!worst||gap<worst.gap)worst={gap,rest:new THREE.Vector3().fromBufferAttribute(position,i).toArray(),posed:v.toArray()};}
    }
  }
  const sleeveHem=[];
  // Regress the actual reported hem crossing, independently of the fit formula.
  // Lateral rays compare the visible cloth and sleeve surfaces at the arm edge.
  if(mode!=='run'){
    const ray=new THREE.Raycaster();
    // The overlapping front mantle has a higher left hem.
    for(const side of [-1,1])for(const height of side<0?[1.33,1.34]:[1.35,1.36]){
      const origin=new THREE.Vector3(side*.7,height,-.005).applyMatrix4(root.matrixWorld);
      const direction=new THREE.Vector3(-side,0,0).transformDirection(root.matrixWorld);
      ray.set(origin,direction);
      const shirt=ray.intersectObject(body,false)[0],fabric=ray.intersectObjects(cloak.meshes,false)[0];
      sleeveHem.push({side:side<0?'right':'left',height,gap:shirt&&fabric?shirt.distance-fabric.distance:null});
    }
  }
  gaps.sort((a,b)=>a-b);
  return {vertices,triangles,finite,separateMesh:body!==cloak.meshes[0],separateSkeleton:body.skeleton!==cloak.meshes[0].skeleton,
    clothBones:cloak.meshes[0].skeleton.bones.length,handleAxisGap:handleGap,sleeveHem,
    rear:{worst,samples:gaps.length,minGap:gaps[0],p01Gap:gaps[Math.floor(gaps.length*.01)],inside:gaps.filter(x=>x<-.003).length}};
}
export async function run(){
  const I=window.__iso;if(!I?.rig.real?.equipmentCloak)throw new Error('Wait for the character to load');
  await I.rig.real.equipmentCloak.ready;
  if(I.rig.real.equipmentCloak.status!=='ready')throw new Error('Cloak failed to load');
  const report={source:I.rig.real.equipmentCloak.group.userData.source,at:new Date().toISOString(),scenarios:{},failures:[]};
  for(const mode of ['idle','walk','run']){
    await shoulderTrace({until:mode==='idle'?1500:1000,runMs:mode==='idle'?0:2000,shift:mode==='walk'});
    I.setCloak(true);I.frame(0,0);
    const result=measure(I,mode);report.scenarios[mode]=result;
    if(result.vertices!==351097 || result.triangles!==641566)report.failures.push(mode+': original resolution changed');
    if(!result.separateMesh || !result.separateSkeleton || result.clothBones!==28)report.failures.push(mode+': independent cloth rig missing');
    if(mode!=='run' && result.sleeveHem.some(p=>p.gap==null || p.gap<.005))report.failures.push(mode+': mantle hem less than 5mm outside sleeve at arm-edge probes');
    if(!result.finite)report.failures.push(mode+': non-finite skinned vertex');
    if(result.handleAxisGap<.03)report.failures.push(mode+': cloth within 3cm of handle axis');
    if(result.rear.samples<1000 || result.rear.inside>0 || result.rear.minGap<.005)report.failures.push(mode+': rear torso clearance below 5mm');
  }
  report.note='Three sampled poses; rear torso and dense vertex-to-handle-axis checks do not certify every animation frame or all cloth/self collisions.';
  const response=await fetch('/debug/save?name=cloak-fit-check.json',{method:'POST',body:JSON.stringify(report,null,2)});
  if(!response.ok)throw new Error('Could not save cloak fit check');
  console.log('CLOAK FIT:',report.failures.length?'FAIL':'PASS',report);
  return report;
}
