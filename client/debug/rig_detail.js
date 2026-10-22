const save=async(name,body)=>fetch('/debug/save?name='+name,{method:'POST',body});
const Vof=I=>I.rig.real.hipsPos.constructor;
function pose(I){I.stop();I.loop('off');I.S.act=null;I.S.phase='idle';I.S.speed=1;const V=Vof(I);for(let k=0;k<130;k++){I.S.pos.set(2.5,0,-1);I.S.facing=0;I.S.moveTo=new V(2.5,0,49);I.frame(0,16,true);}I.S.pos.set(2.5,0,-1);I.rig.real.loco.u=.60;I.frame(0,0);}
function bodyMesh(I){let mesh;I.rig.real.model.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});return mesh;}
function samples(I,mesh){const V=Vof(I),R=I.rig.real,ids=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,names=mesh.skeleton.bones.map(b=>b.name);const out=[];for(let i=0;i<ids.count;i++){let wt=0;const by={};for(let k=0;k<4;k++){const id=ids.array[i*4+k],weight=w.array[i*4+k];if(names[id].includes('RightHand')){wt+=weight;by[names[id]]=weight;}}if(wt>.7){const p=R.skinning.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld);out.push({i,world:p,hand:R.arm.R.ha.worldToLocal(p.clone()),by});}}return out;}
export function gripMetrics(I,mesh=bodyMesh(I)){
 const hand=samples(I,mesh),points=hand.map(p=>({i:p.i,p:I.rig.katana.worldToLocal(p.world.clone()),by:p.by}));
 const byIndex=new Map(points.map(p=>[p.i,p.p])),checks=[...byIndex.values()],idx=mesh.geometry.index;
 for(let i=0;i<idx.count;i+=3){const a=byIndex.get(idx.array[i]),b=byIndex.get(idx.array[i+1]),c=byIndex.get(idx.array[i+2]);if(!a||!b||!c)continue;for(let u=0;u<=4;u++)for(let v=0;v<=4-u;v++)checks.push(a.clone().multiplyScalar(u/4).addScaledVector(b,v/4).addScaledVector(c,1-(u+v)/4));}
 let inside=0,min=9,guard=0;const bins=new Set();const profile=[[-.172,0.01343],[-.15,0.01428],[-.06,0.01496],[.03,0.01428],[.054,0.01377],[.06,0.01572],[.076,0.01488],[.078,0.01488]];/* = index.html TSUKA_PROFILE (TSUKA_S .85) */
 for(const p of checks){if(p.y>=.080&&p.y<=.088&&Math.hypot(p.x,p.z/.9)<.0445)guard++;if(p.y<-.172||p.y>.078)continue;
 let r=0.01462;for(let k=1;k<profile.length;k++)if(p.y<=profile[k][0]){const a=profile[k-1],b=profile[k];r=a[1]+(b[1]-a[1])*(p.y-a[0])/(b[0]-a[0]);break;}
 const gap=Math.hypot(p.x/1.06,p.z/.86)-r;min=Math.min(min,gap);if(gap<-.002)inside++;if(gap<.004)bins.add(Math.floor(((Math.atan2(p.z,p.x)*180/Math.PI)+360)%360/10));}
 return {enclosureDeg:bins.size*10,sampleCount:checks.length,penetratingSamples:inside,guardPenetratingSamples:guard,minSurfaceGapM:min,points:points.map(p=>({i:p.i,p:p.p.toArray(),by:p.by}))};
}
export async function inspect(I,out,tag){pose(I);const R=I.rig.real,V=Vof(I),mesh=bodyMesh(I);const scene=I.rig.root.parent,keep=new Set([I.rig.root,I.rig.katana,I.rig.katana2,...I.rig.eyes]);for(const o of scene.children)if(!keep.has(o)&&!o.isLight)o.visible=false;out.width=2048;out.height=2304;const g=out.getContext('2d');let panel=0;const shot=(label,yaw,focus,zoom,pitch=0)=>{I.CAM.yaw.y=I.CAM.yawT=yaw;I.CAM.pitch.y=I.CAM.pitchT=pitch;I.CAM.zoom.y=I.CAM.zoomT=zoom;I.CAM.focus.copy(focus);I.frame(0,0);const x=panel%2*1024,y=Math.floor(panel/2)*768;g.fillStyle='#aaa';g.fillRect(x,y,1024,768);g.drawImage(I.renderer.domElement,x,y,1024,768);g.fillStyle='#111';g.fillRect(x,y,1024,42);g.fillStyle='#fff';g.font='22px system-ui';g.fillText(label,x+16,y+28);panel++;};
shot('Side: torso / leg roots',-90,new V(2.5,1.05,-1),.8);shot('Front: torso / leg roots',0,new V(2.5,1.05,-1),.8);const h=R.arm.R.ha.getWorldPosition(new V());shot('Grip: palm side',-70,h,.16,0);shot('Grip: opposite side',110,h,.16,0);
shot('Back: spine / shoulder skin',180,new V(2.5,1.05,-1),.8);const normal=mesh.material.normalMap;mesh.material.normalMap=null;mesh.material.needsUpdate=true;shot('Side: geometry without normal map',-90,new V(2.5,1.05,-1),.8);mesh.material.normalMap=normal;mesh.material.needsUpdate=true;const hand=samples(I,mesh),grip=gripMetrics(I,mesh);const data={modelVersion:tag,shaderErrors:I.shaderErrors,grip,hand:hand.map(p=>({i:p.i,p:p.hand.toArray(),by:p.by})),bones:mesh.skeleton.bones.map(b=>({name:b.name,matrix:b.matrixWorld.toArray()})),meshMatrix:mesh.matrixWorld.toArray(),handMatrix:R.arm.R.ha.matrixWorld.toArray(),katanaMatrix:I.rig.katana.matrixWorld.toArray(),triangles:Array.from(mesh.geometry.index.array)};await save('rig-'+tag+'.json',JSON.stringify(data));await new Promise(r=>out.toBlob(async blob=>{await save('rig-'+tag+'.png',blob);r();}));return JSON.stringify({shaderErrors:I.shaderErrors,penetratingSamples:grip.penetratingSamples,guardPenetratingSamples:grip.guardPenetratingSamples,minGapCm:grip.minSurfaceGapM*100},null,2);}

export async function solve(I){
 pose(I);const R=I.rig.real,V=Vof(I),mesh=bodyMesh(I);R.skinning.update();const pts=samples(I,mesh);I.FIST.runAng??={};const solution={};
 for(const finger of ['Index','Middle','Ring','Pinky']){
  const indices=pts.filter(p=>Object.entries(p.by).reduce((s,[n,w])=>s+(n.includes(finger)?w:0),0)>.6).map(p=>p.i);
  let best={score:Infinity};const chain=R.fingers.find(f=>f.side==='Right'&&f.f===finger),Q=R.arm.R.ha.quaternion.constructor;const apply=angles=>{chain.joints.forEach((j,k)=>j.b.quaternion.copy(j.prevInv).multiply(new Q().setFromAxisAngle(chain.A,angles[k])).multiply(j.bindH));R.skinning.update();};
  for(let a=.45;a<=1.35;a+=.15)for(let b=.2;b<=1.4;b+=.15)for(let c=.15;c<=.9;c+=.15){
   if(a+b+c>2.9||c>.75*b+.15)continue;I.FIST.runAng[finger]=[a,b,c];apply([a,b,c]);
   let pen=0,gaps=[];
   for(const idx of indices){const p=R.skinning.getVertexPosition(idx,new V()).applyMatrix4(mesh.matrixWorld);I.rig.katana.worldToLocal(p);if(p.y<-.172||p.y>.078)continue;const gap=Math.hypot(p.x/1.06,p.z/.86)-0.01462;gaps.push(gap);pen+=Math.min(gap-.0005,0)**2;}
   const bone=R.bone['RightHand'+finger+'3'],local=R.arm.R.ha.worldToLocal(bone.getWorldPosition(new V()));
   const wrapError=Math.max(0,local.x-I.RUN_HOLD.pt.x+.003);gaps.sort((a,b)=>a-b);const close=gaps.slice(0,Math.max(1,Math.round(gaps.length*.18)));
   const contact=close.reduce((s,g)=>s+(g-.0015)**2,0)/close.length;
   const score=pen*100+contact*10+wrapError**2*30+((a-.8)**2+(b-.8)**2+(c-.45)**2)*.000002;
   if(score<best.score)best={score,angles:[a,b,c],minGap:Math.min(...gaps),boneX:local.x};
  }
  I.FIST.runAng[finger]=best.angles;apply(best.angles);solution[finger]=best;
  await new Promise(r=>setTimeout(r,0));
 }
 I.frame(0,0);await save('rig-finger-solution.json',JSON.stringify(solution,null,2));return JSON.stringify(solution,null,2);
}
