import * as THREE from 'three';
import {views,hideSheet} from './motion_check.js';

// Grounded in the game's posed skeleton; this never changes the asset or skin weights.
export async function rigSheet(){
  await views({mode:'run',angles:['right'],times:[1018],save:false,zoom:.95,width:1});
  hideSheet();
  const I=window.__iso, root=I.rig.root, scene=root.parent, bones=I.rig.real.bone;
  scene.background=new THREE.Color(0x999da3);
  scene.fog=null;
  I.rig.real.model.traverse(o=>{
    if(!o.isMesh)return;
    if(o.material?.side===THREE.BackSide){o.visible=false;return;}
    const fade=m=>{const c=m.clone();c.onBeforeCompile=m.onBeforeCompile;c.customProgramCacheKey=m.customProgramCacheKey.bind(m);c.transparent=true;c.opacity=.3;c.depthWrite=false;return c;};
    o.material=Array.isArray(o.material)?o.material.map(fade):fade(o.material);
  });
  const overlay=new THREE.Group();scene.add(overlay);
  const mat=color=>new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,transparent:true});
  const red=mat(0xff253c), mint=mat(0x39ffca), gold=mat(0xffdb51), blue=mat(0x54baff);
  const point=n=>bones[n].getWorldPosition(new THREE.Vector3());
  const links=[['Hips','Spine02',gold],['Spine02','Spine01',mint],['Spine01','Spine',gold],['Spine','neck',mint],['neck','Head',blue]];
  for(const s of ['Left','Right']) links.push(['Spine',s+'Shoulder',gold],[s+'Shoulder',s+'Arm',mint],[s+'Arm',s+'ForeArm',blue],[s+'ForeArm',s+'Hand',mint],['Hips',s+'UpLeg',gold],[s+'UpLeg',s+'Leg',blue],[s+'Leg',s+'Foot',mint],[s+'Foot',s+'ToeBase',gold]);
  const joints=new Set();
  for(const [a,b,m] of links){if(!bones[a]||!bones[b])continue;const p=point(a),q=point(b),d=q.clone().sub(p);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,d.length(),8),m);mesh.position.copy(p).add(q).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());mesh.renderOrder=100;overlay.add(mesh);joints.add(a);joints.add(b);}
  const marked=new Set(['Hips','Spine02','Spine01','Spine','LeftUpLeg','RightUpLeg','LeftArm','RightArm']);
  for(const n of joints){const dot=new THREE.Mesh(new THREE.SphereGeometry(marked.has(n)?.019:.012,12,8),marked.has(n)?red:mint);dot.position.copy(point(n));dot.renderOrder=102;overlay.add(dot);if(marked.has(n)){const axes=new THREE.AxesHelper(.095);axes.position.copy(dot.position);axes.quaternion.copy(bones[n].getWorldQuaternion(new THREE.Quaternion()));axes.material.depthTest=false;axes.material.transparent=true;axes.renderOrder=103;overlay.add(axes);}}
  const center=root.localToWorld(new THREE.Vector3(0,.82,0));
  const eye=root.localToWorld(new THREE.Vector3(5,.82,0));
  I.renderer.setPixelRatio(1);I.renderer.setSize(1400,1000,false);
  const camera=I.camera;camera.left=-1.47;camera.right=1.47;camera.top=1.05;camera.bottom=-1.05;
  camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(center);camera.zoom=1;camera.updateProjectionMatrix();
  I.renderer.render(scene,camera);
  // The labels explicitly describe the real hierarchy: 3 spine bones + pelvis.
  const cv=document.createElement('canvas'),src=I.renderer.domElement;
  cv.width=src.width;cv.height=src.height;const g=cv.getContext('2d');g.drawImage(src,0,0);const scale=cv.width/1200;g.scale(scale,scale);g.fillStyle='#fff';g.font='bold 23px monospace';g.fillText('RUN / SKELETAL STUDY — EXACT SIDE',28,36);g.font='15px monospace';g.fillText('Pelvis → lower spine → middle spine → chest → neck',28,64);g.fillText('3 existing spine bones • red = key joints • RGB = local rotation axes',28,90);
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));await fetch('/debug/save?name=run-rig-sheet.png',{method:'POST',body:blob});
  const out=document.getElementById('motionSheet');out.width=cv.width;out.height=cv.height;out.getContext('2d').drawImage(cv,0,0);out.style.display='block';
  return 'Saved out/run-rig-sheet.png — actual rig: pelvis + 3 spine bones; reload before another review.';
}
