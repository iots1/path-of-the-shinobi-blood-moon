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
