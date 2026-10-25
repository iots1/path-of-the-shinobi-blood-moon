// Legacy pre-collision diagnostic: linear-skinned source vertices versus capsules.
// These values are NOT displayed penetration after the GPU push. For displayed
// cloth use /debug/cloak_surface_check.js (beforeDepthMm + afterDepthMm).
// Fresh load, then: const c=await import('/debug/cloak_arm_check.js'); await c.run();
// Saves out/cloak-arm-check.json. Freezes the loop; reload to resume play.
import * as THREE from 'three';

const key=(k,down,shift=false)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:k,code:'Key'+k.toUpperCase(),shiftKey:shift,bubbles:true}));

function depths(I){
  const cloak=I.rig.real.equipmentCloak,root=I.rig.root,v=new THREE.Vector3();
  I.frame(0,0);cloak.prepareRender();
  const caps=cloak.collisionCapsules?cloak.collisionCapsules():[];
  const worst={};let total=0;
  for(const mesh of cloak.meshes){
    mesh.updateMatrixWorld(true);
    const position=mesh.geometry.attributes.position,toWorld=mesh.matrixWorld;
    for(let i=0;i<position.count;i+=3){
      v.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(toWorld);
      for(const c of caps){
        const ab=c.b.clone().sub(c.a),t=THREE.MathUtils.clamp(v.clone().sub(c.a).dot(ab)/ab.lengthSq(),0,1);
        const d=THREE.MathUtils.lerp(c.r,c.r1,t)-v.distanceTo(c.a.clone().addScaledVector(ab,t));
        if(d>0){total++;if(!worst[c.name]||d>worst[c.name])worst[c.name]=d;}
      }
    }
  }
  return {worst,total};
}

export async function run(){
  const I=window.__iso;await I.rig.real.equipmentCloak.ready;
  const scenarios={idle:{until:600},run:{until:1500,runMs:1500},combo:{until:1900,presses:[0,420,860]},thrust:{until:1100,presses:[0],fn:'pressK'},dual:{until:1900,presses:[0,340],fn:'pressK'},finisher:{until:1800,presses:[0],fn:'pressL'}};
  const report={at:new Date().toISOString(),surface:'linear skin before GPU collision',note:'Legacy pre-push depths, not visible penetration. Use cloak_surface_check.js for displayed collision-deformed geometry and fresh scenario resets.',scenarios:{}};
  for(const [name,o] of Object.entries(scenarios)){
    I.stop();let t=0,pi=0;const presses=o.presses||[],peak={},samples=[];
    if(o.runMs)key('a',true);
    while(t<o.until){
      if(pi<presses.length&&t>=presses[pi]){(o.fn?I[o.fn]:I.press)();pi++;}
      I.frame(0,4,true);t+=4;
      if(t%48===0){const r=depths(I);samples.push({t,total:r.total});for(const k in r.worst)peak[k]=Math.max(peak[k]||0,r.worst[k]);}
    }
    if(o.runMs)key('a',false);
    report.scenarios[name]={peakDepthMm:Object.fromEntries(Object.entries(peak).map(([k,d])=>[k,+(d*1000).toFixed(1)])),worstTotal:Math.max(0,...samples.map(s=>s.total))};
  }
  await fetch('/debug/save?name=cloak-arm-check.json',{method:'POST',body:JSON.stringify(report,null,2)});
  console.log('CLOAK ARM CHECK',report);return report;
}
