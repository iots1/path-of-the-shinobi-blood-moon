// Side-view sheet of the run at fixed leg phases (for comparing with frames of the reference video).
// usage (console): const c=await import('/debug/run-compare.js?'+Date.now()); await c.sheet(__iso,{tag:'v6'})
const save=(name,body)=>fetch('/debug/save?name='+name,{method:'POST',body});
export async function sheet(I,{tag='v6',phases=[0,.08,.16,.24,.32,.40,.48,.56,.64,.72,.80,.90],zoom=1.45,w=300,h=330,yaw=-90}={}){
  I.stop();I.loop('off');const S=I.S,R=I.rig.real,V=R.hipsPos.constructor;
  const pin=()=>{S.pos.set(2.5,0,-1);S.moveTo=new V(2.5,0,20);S.facing=0;};
  S.act=null;S.phase='idle';S.speed=1;S.vel.set(0,0,0);
  for(let i=0;i<350;i++){pin();I.frame(0,4,true);}
  const scene=I.rig.root.parent,keep=new Set([I.rig.root,I.rig.katana,I.rig.katana2,...I.rig.eyes]);
  const hidden=[];for(const o of scene.children)if(!keep.has(o)&&!o.isLight&&o.visible){o.visible=false;hidden.push(o);}
  const cv=I.renderer.domElement,out=document.createElement('canvas');out.width=w*phases.length;out.height=h+24;
  const g=out.getContext('2d');g.fillStyle='#e8e4dc';g.fillRect(0,0,out.width,out.height);const info=[];
  for(let i=0;i<phases.length;i++){
    for(let k=0;k<60;k++){pin();R.loco.u=(.25+phases[i]+1)%1;I.frame(0,4,true);}
    I.CAM.yaw.y=I.CAM.yawT=S.facing*180/Math.PI+yaw;I.CAM.pitch.y=I.CAM.pitchT=0;I.CAM.zoom.y=I.CAM.zoomT=zoom;I.CAM.focus.set(S.pos.x,.8,S.pos.z);
    R.loco.u=(.25+phases[i]+1)%1;I.frame(0,0);
    const sw=cv.height*w/h;g.drawImage(cv,(cv.width-sw)/2,0,sw,cv.height,i*w,24,w,h);
    g.fillStyle='#222';g.font='15px sans-serif';g.fillText(tag+' p'+Math.round(phases[i]*100),i*w+6,17);
    const m=R.referenceRun?.Left;info.push(m&&{p:+m.phase.toFixed(2),thigh:Math.round(m.thigh),knee:Math.round(m.knee),reach:+m.reachError.toFixed(3)});
  }
  for(const o of hidden)o.visible=true;S.moveTo=null;
  await save('run-compare-'+tag+'.png',await new Promise(r=>out.toBlob(r)));
  return info;
}
// Settle the run at leg phase u (character pinned in place) and measure the sword hand: blade angle below horizontal, its sideways swing (0 = straight
// back), blade vs forearm, finger axis vs forearm, the wrist's anatomical range use (1 = on WRIST_LIM's ellipse), kashira height above the wrist (cm).
export function measureRunGrip(I,u=.25,n=150){
  const S=I.S,R=I.rig.real,V=R.hipsPos.constructor,Q=R.arm.R.ha.quaternion.constructor;
  for(let k=0;k<n;k++){S.pos.set(2.5,0,-1);S.moveTo=new V(2.5,0,20);S.facing=0;R.loco.u=u;I.frame(0,4,true);}
  R.loco.u=u;I.frame(0,0);
  const inv=I.rig.root.quaternion.clone().invert(),L=p=>I.rig.root.worldToLocal(p),a=R.arm.R;
  const el=a.fo.getWorldPosition(new V()),wr=a.ha.getWorldPosition(new V()),fo=L(wr.clone()).sub(L(el.clone())).normalize();
  const bd=new V(0,1,0).applyQuaternion(I.rig.katana.quaternion).applyQuaternion(inv);
  const fing=new V(0,1,0).applyQuaternion(a.ha.getWorldQuaternion(new Q())).applyQuaternion(inv);
  const fh=wr.clone().sub(el).normalize().applyQuaternion(a.ha.getWorldQuaternion(new Q()).invert());
  const bend=Math.acos(Math.max(-1,Math.min(1,fh.y))),phi=Math.atan2(-fh.z,fh.x),fl=bend*Math.cos(phi)*57.3,rd=bend*Math.sin(phi)*57.3;
  const kash=L(I.rig.katana.localToWorld(new V(0,-.19,0))),d=x=>+x.toFixed(1);
  return {below:d(Math.asin(-bd.y)*57.3),side:d(Math.atan2(-bd.x,-bd.z)*57.3),vsFore:d(bd.angleTo(fo)*57.3),bend:d(fing.angleTo(fo)*57.3),
    flex:d(fl),radial:d(rd),rom:+Math.hypot(fl/(fl>=0?80:70),rd/(rd>=0?25:40)).toFixed(2),kash:d((kash.y-L(wr.clone()).y)*100)};
}
// Close-ups of the running sword hand: rows = camera yaws around the character, columns = leg phases.
// usage: await c.handSheet(__iso,{tag:'grip-a'}) → out/run-hand-<tag>.png
export async function handSheet(I,{tag='grip',phases=[0,.25,.5,.75],yaws=[-90,-30,30,90,180],zoom=.22,w=260,h=260}={}){
  I.stop();I.loop('off');const S=I.S,R=I.rig.real,V=R.hipsPos.constructor;
  const pin=()=>{S.pos.set(2.5,0,-1);S.moveTo=new V(2.5,0,20);S.facing=0;};
  S.act=null;S.phase='idle';S.speed=1;S.vel.set(0,0,0);
  for(let i=0;i<350;i++){pin();I.frame(0,4,true);}
  const scene=I.rig.root.parent,keep=new Set([I.rig.root,I.rig.katana,I.rig.katana2,...I.rig.eyes]);
  const hidden=[];for(const o of scene.children)if(!keep.has(o)&&!o.isLight&&o.visible){o.visible=false;hidden.push(o);}
  const cv=I.renderer.domElement,out=document.createElement('canvas');out.width=w*phases.length;out.height=(h+20)*yaws.length;
  const g=out.getContext('2d');g.fillStyle='#e8e4dc';g.fillRect(0,0,out.width,out.height);
  for(let i=0;i<phases.length;i++){
    for(let k=0;k<60;k++){pin();R.loco.u=(.25+phases[i]+1)%1;I.frame(0,4,true);}
    const hand=R.arm.R.ha.getWorldPosition(new V());
    for(let j=0;j<yaws.length;j++){
      I.CAM.yaw.y=I.CAM.yawT=S.facing*180/Math.PI+yaws[j];I.CAM.pitch.y=I.CAM.pitchT=0;I.CAM.zoom.y=I.CAM.zoomT=zoom;I.CAM.focus.copy(hand);
      R.loco.u=(.25+phases[i]+1)%1;I.frame(0,0);
      const s=Math.min(cv.width,cv.height);g.drawImage(cv,(cv.width-s)/2,(cv.height-s)/2,s,s,i*w,j*(h+20)+20,w,h);
      g.fillStyle='#222';g.font='13px sans-serif';g.fillText(`${tag} p${Math.round(phases[i]*100)} yaw${yaws[j]}`,i*w+4,j*(h+20)+14);
    }
  }
  for(const o of hidden)o.visible=true;S.moveTo=null;
  await save('run-hand-'+tag+'.png',await new Promise(r=>out.toBlob(r)));
  return 'saved out/run-hand-'+tag+'.png';
}
