import {gripMetrics} from './rig_detail.js';
const save=(name,data)=>fetch('/debug/save?name='+name,{method:'POST',body:typeof data==='string'||data instanceof Blob?data:JSON.stringify(data,null,1)});
export async function inspect(I,tag='before'){
 I.stop();I.loop('off');if(tag.includes('before'))I.FIST.thumbGrip=null;const R=I.rig.real,V=R.hipsPos.constructor,Q=I.rig.root.quaternion.constructor,E=I.rig.root.rotation.constructor;
 const key=(down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:'a'}));
 I.S.act=null;I.S.vel.set(0,0,0);I.S.pos.set(2.5,0,-1);I.S.facing=0;
 for(let i=0;i<160;i++)I.frame(0,16,true);
 let mesh;R.model.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});
 const thumb=()=>{R.skinning.update();const gm=gripMetrics(I,mesh),pts=gm.points.filter(p=>Object.entries(p.by).some(([n,w])=>n.includes('Thumb')&&w>.5)).map(p=>p.p);return {points:pts,tip:I.rig.katana.worldToLocal(R.bone.RightHandThumb4.getWorldPosition(new V())).toArray()};};
 const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200;const g=canvas.getContext('2d');
 const shot=(label,x,y,yaw,focus,zoom=.15,pitch=0)=>{I.CAM.yaw.y=I.CAM.yawT=yaw;I.CAM.pitch.y=I.CAM.pitchT=pitch;I.CAM.zoom.y=I.CAM.zoomT=zoom;I.CAM.focus.copy(focus);I.frame(0,0);const cv=I.renderer.domElement,sw=cv.height*1.5;g.drawImage(cv,(cv.width-sw)/2,0,sw,cv.height,x,y,900,600);g.fillStyle='#222';g.fillRect(x,y,900,28);g.fillStyle='#fff';g.font='18px sans-serif';g.fillText(label,x+10,y+21);};
 const solutions={};if(tag.includes('solve'))solutions.idle=await solveThumb(I);
 const palmShot=(mode,y)=>{const h=R.arm.R.ha.localToWorld(new V(-.025,.065,0)),n=new V(-1,0,0).applyQuaternion(R.arm.R.ha.getWorldQuaternion(new Q())),yaw=Math.atan2(n.x,n.z)*180/Math.PI,pitch=Math.asin(n.y)*180/Math.PI;shot(mode+' / thumb side',0,y,yaw,h,.13,pitch);shot(mode+' / opposite',900,y,yaw+180,h,.13,-pitch);};
 const data={idle:thumb(),feet:[],solutions};palmShot('Idle',0);
 I.CAM.yaw.y=I.CAM.yawT=45;key(true);
 for(let i=0;i<380;i++){I.frame(0,4,true);if(i<180)continue;
  const feet={phase:R.loco.u};for(const side of ['Left','Right']){const f=R.bone[side+'Foot'],toe=R.bone[side+'ToeBase'],q=I.rig.root.getWorldQuaternion(new Q()).invert().multiply(f.getWorldQuaternion(new Q())).multiply(R.bind[side+'Foot'].rl.clone().invert()).multiply(R.soleYaw[side]),e=new E().setFromQuaternion(q,'YXZ');feet[side]={pitch:e.x*180/Math.PI,bank:e.z*180/Math.PI,yaw:e.y*180/Math.PI,q:q.toArray(),footY:f.getWorldPosition(new V()).y,toeY:toe.getWorldPosition(new V()).y};}data.feet.push(feet);
 }
 key(false);if(tag.includes('solve'))solutions.run=await solveThumb(I);data.run=thumb();palmShot('Run',600);
 data.checks={};for(const side of ['Left','Right']){
 const low=data.feet.map(f=>f[side]).filter(f=>Math.min(f.footY,f.toeY)<=.12);
 let rate=0;for(let i=1;i<data.feet.length;i++)rate=Math.max(rate,new Q(...data.feet[i-1][side].q).angleTo(new Q(...data.feet[i][side].q))*180/Math.PI/.004);
 data.checks[side]={supportSamples:low.length,maxBank:Math.max(...low.map(f=>Math.abs(f.bank))),maxPitch:Math.max(...low.map(f=>Math.abs(f.pitch))),maxAngularRate:rate};
 }
 data.pass=Object.values(data.checks).every(c=>c.supportSamples>0&&c.maxBank<=9&&c.maxPitch<=40);
 await save('foot-grip-'+tag+'.json',data);await save('foot-grip-'+tag+'.png',await new Promise(r=>canvas.toBlob(r)));await feetSheet(I,tag);return (data.pass?'PASS ':'FAIL ')+'Saved foot-grip-'+tag+' '+JSON.stringify(data.checks);
}

// Fit the thumb's distal skin to the actual hilt; keep deep penetration and guard collisions costly.
async function solveThumb(I){
 const R=I.rig.real,V=R.hipsPos.constructor,Q=I.rig.root.quaternion.constructor;
 const chain=R.fingers.find(c=>c.side==='Right'&&c.thumb);let mesh;R.model.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});
 const ids=mesh.geometry.attributes.skinIndex,ws=mesh.geometry.attributes.skinWeight,names=mesh.skeleton.bones.map(b=>b.name),verts=[];
 for(let i=0;i<ids.count;i++){let wt=0;for(let j=0;j<4;j++)if(/RightHandThumb[23]/.test(names[ids.array[i*4+j]]))wt+=ws.array[i*4+j];if(wt>.5)verts.push(i);}
 const put=(axis,ang)=>{chain.joints.forEach((j,k)=>j.b.quaternion.copy(j.prevInv).multiply(new Q().setFromAxisAngle(axis,ang[k])).multiply(j.bindH));R.skinning.update();};
 const score=(axis,ang)=>{
  put(axis,ang);let pen=0,guard=0;const gaps=[];
  for(const i of verts){const p=R.skinning.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld);I.rig.katana.worldToLocal(p);if(p.y>.078){guard+=Math.max(0,p.y-.078)**2;continue;}if(p.y<-.172)continue;const gap=Math.hypot(p.x/1.06,p.z/.86)-.0172;gaps.push(gap);pen+=Math.min(0,gap+.0012)**2;}
  gaps.sort((a,b)=>a-b);if(gaps.length<4)return {cost:1e6};
  const tip=I.rig.katana.worldToLocal(R.bone.RightHandThumb4.getWorldPosition(new V())),tipGap=Math.hypot(tip.x/1.06,tip.z/.86)-.0172;
  const near=gaps.slice(0,Math.max(4,Math.floor(gaps.length*.35))),contact=near.reduce((s,g)=>s+(g-.0015)**2,0)/near.length;
  const cost=pen*300+guard*100+contact*25+(tipGap-.0055)**2*3+Math.max(0,ang[0]+ang[1]+ang[2]-2.2)**2*.0001;
  return {cost,min:gaps[0],contact:near.reduce((a,b)=>a+b,0)/near.length,tipGap};
 };
 let best={axis:chain.A.toArray(),angles:[.42,.6,.48],...score(chain.A,[.42,.6,.48])};let seed=19583;
 const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let pass=0;pass<3;pass++){
  const start=best,span=[.65,.25,.09][pass];
  for(let i=0;i<360;i++){
   const axis=new V(...start.axis).add(new V((rnd()-.5)*span,(rnd()-.5)*span,(rnd()-.5)*span)).normalize();
   const angles=start.angles.map((a,k)=>Math.max(.05,Math.min(k===0?1.15:1.05,a+(rnd()-.5)*span*1.5)));
   const m=score(axis,angles);if(m.cost<best.cost)best={axis:axis.toArray(),angles,...m};
   if(i%90===0)await new Promise(r=>setTimeout(r,0));
  }
 }
 I.FIST.thumbGrip??={};I.FIST.thumbGrip[R.loco.b>.5?'run':'idle']=best;put(new V(...best.axis),best.angles);return best;
}

async function feetSheet(I,tag){
 const R=I.rig.real,V=R.hipsPos.constructor,canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1100;const g=canvas.getContext('2d');
 const phases=[.45,.49,.53,.57,.95,.99,.03,.07];
 for(let i=0;i<phases.length;i++){
  R.loco.u=phases[i];I.step(.004);I.frame(0,0);const side=i<4?'Left':'Right',foot=R.bone[side+'Foot'];
  for(let row=0;row<2;row++){
   I.CAM.yaw.y=I.CAM.yawT=I.S.facing*180/Math.PI+(row?-90:0);I.CAM.pitch.y=I.CAM.pitchT=4;I.CAM.zoom.y=I.CAM.zoomT=.28;
   I.CAM.focus.copy(foot.getWorldPosition(new V())).add(new V(0,.04,0));I.frame(0,0);
   const cv=I.renderer.domElement,sw=cv.height*300/550;g.drawImage(cv,(cv.width-sw)/2,0,sw,cv.height,i*300,row*550,300,550);g.fillStyle='#222';g.fillRect(i*300,row*550,300,28);g.fillStyle='#fff';g.font='16px sans-serif';g.fillText(side+' '+phases[i]+' '+(row?'side':'front'),i*300+6,row*550+20);
  }
 }
 await save('feet-contact-'+tag+'.png',await new Promise(r=>canvas.toBlob(r)));
}
