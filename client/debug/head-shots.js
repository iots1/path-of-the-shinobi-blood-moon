// Head close-up contact sheet from the live game (standing idle, world hidden): await (await import('/debug/head-shots.js')).sheet(__iso,{tag:'x'})
// → out/head-shots-<tag>.png. Views: yaw offsets / pitch (deg) / zoom (smaller = closer) around the head.
export const VIEWS=[{n:'front',y:0,p:4},{n:'3/4 R',y:40,p:6},{n:'side R',y:85,p:4},{n:'back 3/4',y:140,p:8},{n:'side L',y:-85,p:4},{n:'3/4 L',y:-40,p:6},{n:'low',y:15,p:-35},{n:'high',y:30,p:40}];
export async function sheet(I,{tag='head',zoom=.13,fy=1.6,size=420,views=VIEWS}={}){
  I.stop(); const S=I.S; S.act=null; S.phase='idle'; S.moveTo=null;
  for(let i=0;i<300;i++){ S.pos.set(2.5,0,-1); S.facing=0; S.vel.set(0,0,0); I.frame(0,4,true); }
  const scene=I.rig.root.parent, hidden=[];
  for(const o of scene.children) if(o!==I.rig.root&&!o.isLight&&o.visible){ o.visible=false; hidden.push(o); }
  const D=180/Math.PI, c=I.renderer.domElement, cols=4, rows=Math.ceil(views.length/cols);
  const out=document.createElement('canvas'); out.width=cols*size; out.height=rows*size; const g=out.getContext('2d');
  g.fillStyle='#e9e4da'; g.fillRect(0,0,out.width,out.height); g.font='bold 18px system-ui'; g.fillStyle='#b00';
  views.forEach((v,i)=>{
    I.CAM.yaw.y=I.CAM.yawT=I.rig.root.rotation.y*D+v.y; I.CAM.pitch.y=I.CAM.pitchT=v.p; I.CAM.zoom.y=I.CAM.zoomT=zoom;
    I.CAM.focus.set(S.pos.x,fy,S.pos.z); I.frame(0,0);
    const s=Math.min(c.width,c.height)*.62; g.drawImage(c,(c.width-s)/2,(c.height-s)/2-c.height*.12,s,s,(i%cols)*size,Math.floor(i/cols)*size,size,size);
    g.fillText(v.n,(i%cols)*size+8,Math.floor(i/cols)*size+22);
  });
  for(const o of hidden) o.visible=true;
  await new Promise(r=>out.toBlob(async b=>{ await fetch(`/debug/save?name=head-shots-${tag}.png`,{method:'POST',body:b}); r(); }));
  return `out/head-shots-${tag}.png`;
}
