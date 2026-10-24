import * as THREE from 'three';
import {views,hideSheet} from './motion_check.js';

// One simulation, three renders. "Hidden" means the whole unified skin is hidden,
// not a nude body: the asset has no independent garment/body meshes.
export async function clothComparison({baseline=false}={}){
  const I=window.__iso;
  if(baseline){
    Object.assign(I.RUN_TUNE,{recoil:.012,hipTurn:.045,chestTurn:.075,spineWave:0});
    I.RUN_ARM.swing=.012;I.SHOULDER.runPulse=.018;
  }
  await views({mode:'run',angles:['right'],times:[1018],save:false,zoom:.95,width:1});
  hideSheet();
  const root=I.rig.root,scene=root.parent,real=I.rig.real;
  scene.background=new THREE.Color(0x9da1a6);scene.fog=null;
  const meshes=[];
  real.model.traverse(o=>{if(o.isMesh)meshes.push({o,visible:o.visible,materials:Array.isArray(o.material)?o.material:[o.material]});});
  const bones=new THREE.Group();scene.add(bones);
  const links=[['Hips','Spine02'],['Spine02','Spine01'],['Spine01','Spine'],['Spine','neck'],['neck','Head']];
  for(const s of ['Left','Right'])links.push(['Spine',s+'Shoulder'],[s+'Shoulder',s+'Arm'],[s+'Arm',s+'ForeArm'],[s+'ForeArm',s+'Hand'],['Hips',s+'UpLeg'],[s+'UpLeg',s+'Leg'],[s+'Leg',s+'Foot'],[s+'Foot',s+'ToeBase']);
  const material=color=>new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,transparent:true});
  const cyan=material(0x36ffd4),yellow=material(0xffda58),red=material(0xff294f);
  const segments=links.map(([a,b],i)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,1,6),i<5?yellow:cyan);mesh.renderOrder=100;bones.add(mesh);return {a,b,mesh};
  });
  const dots=[...new Set(links.flat())].map(n=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.013,8,6),red);mesh.renderOrder=101;bones.add(mesh);return {n,mesh};});
  const p=new THREE.Vector3(),q=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  function updateBones(){
    root.updateMatrixWorld(true);
    for(const {a,b,mesh} of segments){real.bone[a].getWorldPosition(p);real.bone[b].getWorldPosition(q);mesh.position.copy(p).add(q).multiplyScalar(.5);q.sub(p);mesh.scale.y=q.length();mesh.quaternion.setFromUnitVectors(up,q.normalize());}
    for(const {n,mesh}of dots)real.bone[n].getWorldPosition(mesh.position);
  }
  const output=document.createElement('canvas');output.width=1440;output.height=620;
  output.id='clothComparison';output.style.cssText='position:fixed;left:0;top:0;z-index:110;width:100%;height:auto;max-height:90vh;object-fit:contain;background:#9da1a6';
  const backdrop=document.createElement('div');backdrop.style.cssText='position:fixed;inset:0;z-index:109;background:#9da1a6';document.body.append(backdrop,output);
  I.renderer.domElement.style.visibility='hidden';
  const ctx=output.getContext('2d');
  const display=document.createElement('canvas');display.style.cssText=output.style.cssText;output.style.display='none';document.body.append(display);
  let focus=-1;
  const controls=document.createElement('div');controls.style.cssText='position:fixed;top:calc(100vw * .431);left:0;z-index:111;background:#eee;padding:8px;font:14px system-ui';
  const pause=document.createElement('button');pause.textContent='Pause';
  const angle=document.createElement('button');angle.textContent='View: side';
  const pace=document.createElement('button');pace.textContent='Speed: 0.5×';
  const focusButton=document.createElement('button');focusButton.textContent='Focus: all';
  focusButton.onclick=()=>{focus=focus===2?-1:focus+1;focusButton.textContent='Focus: '+['all','bones','clothed','overlay'][focus+1];controls.style.top=focus<0?'calc(100vw * .431)':'min(calc(100vw * 1.292), calc(100vh - 46px))';};
  controls.append(pause,angle,pace,focusButton);document.body.append(controls);
  let playing=true,front=false,rate=.5;
  pause.onclick=()=>{playing=!playing;pause.textContent=playing?'Pause':'Play';};
  angle.onclick=()=>{front=!front;angle.textContent=front?'View: front':'View: side';};
  pace.onclick=()=>{rate=rate===.5?1:.5;pace.textContent='Speed: '+rate+'×';};
  const labels=['SKIN HIDDEN / actual bones','CLOTHED / normal game skin','OVERLAY / same pose'];
  function render(){
    updateBones();real.skinning?.update();
    I.renderer.setPixelRatio(1);I.renderer.setSize(640,760,false);
    const c=I.camera,center=root.localToWorld(new THREE.Vector3(0,.83,0));
    c.position.copy(root.localToWorld(front?new THREE.Vector3(0,.83,5):new THREE.Vector3(5,.83,0)));
    c.up.set(0,1,0);c.lookAt(center);c.left=-1.364;c.right=1.364;c.top=1.62;c.bottom=-1.62;c.zoom=1.3;c.updateProjectionMatrix();
    ctx.fillStyle='#9da1a6';ctx.fillRect(0,0,output.width,output.height);
    for(let col=0;col<3;col++){
      for(const {o,visible,materials}of meshes){o.visible=col===0?false:visible;
        for(const m of materials){if(m.transparent!==(col===2)){m.transparent=col===2;m.needsUpdate=true;}m.opacity=col===2?.23:1;m.depthWrite=col!==2;}}
      bones.visible=col!==1;I.renderer.render(scene,c);
      ctx.drawImage(I.renderer.domElement,col*480,50,480,570);
      ctx.fillStyle='#fff';ctx.font='bold 18px monospace';ctx.fillText(labels[col],col*480+14,30);
      ctx.strokeStyle='#777';ctx.strokeRect(col*480,50,480,570);
    }
    const dw=focus<0?1440:480;if(display.width!==dw||display.height!==620){display.width=dw;display.height=620;}
    display.getContext('2d').drawImage(output,focus<0?0:focus*480,0,dw,620,0,0,dw,620);
    // Restore authored visibility/material state before another simulation step.
    for(const {o,visible,materials}of meshes){o.visible=visible;for(const m of materials){if(m.transparent){m.transparent=false;m.needsUpdate=true;}m.opacity=1;m.depthWrite=true;}}
    bones.visible=false;
  }
  const sheet=document.createElement('canvas');sheet.width=1440;sheet.height=4*620;const sg=sheet.getContext('2d');
  let elapsed=0,shots=0,last=performance.now(),saved=false;
  const anchor=I.S.pos.clone();
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'a'}));
  function tick(now){
    const dt=playing?Math.min(32,Math.max(0,now-last))*rate:0;last=now;
    I.S.pos.copy(anchor);I.frame(0,dt,true);I.S.pos.copy(anchor);render();elapsed+=dt;
    if(shots<4 && elapsed>=shots*148){
      sg.drawImage(output,0,shots*620);
      if(shots===0&&!baseline)output.toBlob(blob=>fetch('/debug/save?name=run-cloth-preview.png',{method:'POST',body:blob}));
      shots++;
    }
    if(shots===4&&!saved){saved=true;sheet.toBlob(async blob=>{const response=await fetch('/debug/save?name=run-cloth-compare-'+(baseline?'before':'after')+'.png',{method:'POST',body:blob});if(!response.ok)console.error('Comparison save failed',response.status);});}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return 'Live: identical pose in all 3 panels. Skin hidden = skeleton only (body and clothes are one mesh). Captures 4 phases to out/run-cloth-compare-'+(baseline?'before':'after')+'.png. Use Pause / View / Speed below.';
}
