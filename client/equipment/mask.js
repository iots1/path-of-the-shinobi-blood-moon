import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Face/neck gaiter (assets/mask.glb, native size ~1.3 x 1.9 x 1.75 m, front = +Z like the character).
// Rigid accessory: follows the real Head bone, never touches bones, the grip solver or ninja.glb.
// FIT = root-local placement at the bind pose (metres, y up, front +z); the nose notch sits on the nose bridge.
export const MASK_FIT={x:0,y:1.478,z:-.005,sx:.136,sy:.16,sz:.155};
// Below the jaw the gaiter is pulled in onto the neck (ellipse rx/rz around x=0,z=cz) so its lower part sits inside
// the kimono collar instead of hanging over it: the hem tucks under the V of the collar, front and back.
// From y0 (free cloth) to y1 (fully on the neck) the radius blends down; below y1 it is a neck-sized tube.
export const MASK_NECK={y0:1.475,y1:1.44,cz:-.015,rx:.054,rz:.05,tail:.6,hem:1.33,back:0,yb:1.495};
// The front of the gaiter hugs the face: each front vertex is moved in z onto the (blurred) skin surface + off,
// so the profile (nose, chin, jaw) matches the bare face minus the fine lip crease. blur = box radius in 3 mm cells.
export const MASK_FACE={on:true,off:.006,blur:3,grow:3};   /* grow = max-filter radius first, so the cloth always clears nose/lips */
// Sides and back: radial version of the same idea. The mask radius around the head axis follows the head (hair, ears,
// nape) + side; below the collar top (top of the grey garment, `collar`: sides / back, metres) it sits `under` inside the
// garment surface, so black never lies on top of grey. `lift` raises the side/back rim to cover the ears and occiput.
export const MASK_WRAP={on:true,side:.006,under:.004,neckY:1.525,lift:0,grow:3,blur:2,cz:-.02};
// Collar line: the body texture tells skin from the grey garment. Per direction around the neck, scanning down from
// `scan`, the first run of `run` non-skin cells after the neck skin is the collar edge yc (no skin found: neighbours' yc).
// Below yc the mask is pushed `inset` inside the garment surface (never drawn over grey); between yc and `top` it hugs
// the skin/hair + `off`. So the black ends exactly on the collar line: the V at the front, the collar at the back.
export const MASK_COLLAR={on:true,scan:1.545,top:1.545,run:3,off:.006,inset:.006,grow:2};   /* grow = max-filter over cells above the collar line only */
// Upper edge (reference ninja_side.jpeg: ears and the back of the head stay bare). Behind the cheek the cloth above
// yTop(angle) is pushed `inset` inside the head/hair surface, so the visible edge runs from the nose bridge along the
// cheek to below the ear and around the nape. |angle| < front: untouched; front..back: yFront -> yBack; beyond: yBack.
export const MASK_TRIM={on:true,front:.75,back:1.45,yFront:1.6,yBack:1.545,inset:.006};
const PB=120,PY0=1.4,PYC=.003,PH=107;
const GX0=-.1,GY0=1.4,CELL=.003,GW=67,GH=82;
export function createMask({THREE,root,real,loadTexture,onReady=()=>{}}){
  const group=new THREE.Group();group.name='equipment-mask';group.matrixAutoUpdate=false;root.add(group);
  const head=real.bone.Head,headM=new THREE.Matrix4(),rootInv=new THREE.Matrix4(),local=new THREE.Matrix4(),fit=new THREE.Matrix4();
  const accessory={group,status:'loading',error:null,ready:null,update,load,fit:MASK_FIT,neck:MASK_NECK,face:MASK_FACE,wrap:MASK_WRAP,collar:MASK_COLLAR,trim:MASK_TRIM,refit,reshape};
  let raw=null,praw=null,pcls=null;   /* front-most skin z per (x,y) cell, root-local bind pose */
  let shaped=[];   /* [{position attribute, original copy}] */
  function refit(){
    root.updateMatrixWorld(true);
    const headInv=rootInv.copy(root.matrixWorld).invert().multiply(head.matrixWorld).invert();
    fit.compose(new THREE.Vector3(MASK_FIT.x,MASK_FIT.y,MASK_FIT.z),new THREE.Quaternion(),new THREE.Vector3(MASK_FIT.sx,MASK_FIT.sy,MASK_FIT.sz));
    local.multiplyMatrices(headInv,fit);   /* mask in Head-bone space; stays rigid on the head */
  }
  function skinField(){
    let body=null;
    root.traverse(o=>{if(o.isSkinnedMesh&&!/^equipment-/.test(o.parent?.name||'')&&(!body||o.geometry.attributes.position.count>body.geometry.attributes.position.count))body=o;});
    if(!body)return;
    root.updateMatrixWorld(true);body.skeleton.update();
    const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(),P=new THREE.Vector3(),n=body.geometry.attributes.position.count;
    raw=new Float32Array(GW*GH).fill(-9);praw=new Float32Array(PB*PH).fill(-9);pcls=new Int8Array(PB*PH).fill(-1);
    const mat=Array.isArray(body.material)?body.material[0]:body.material,img=mat?.map?.image,uv=body.geometry.attributes.uv,TS=2048;
    let tex=null;
    if(img&&uv){const cv=new OffscreenCanvas(TS,TS),cx=cv.getContext('2d');cx.drawImage(img,0,0,TS,TS);tex=cx.getImageData(0,0,TS,TS).data;}
    const flipV=mat?.map?.flipY;
    const classify=i=>{   /* 2 = skin, 1 = near-black (hair), 0 = other (grey garment) */
      if(!tex)return 0;
      const u=uv.getX(i),v=uv.getY(i),px=Math.min(TS-1,Math.max(0,Math.floor(u*TS))),py=Math.min(TS-1,Math.max(0,Math.floor((flipV?1-v:v)*TS))),k=(py*TS+px)*4;
      const r=tex[k],g=tex[k+1],b=tex[k+2];
      if(r>=96&&r-b>=24&&r>=g)return 2;
      return Math.max(r,g,b)<48?1:0;
    };
    for(let i=0;i<n;i++){
      body.getVertexPosition(i,P).applyMatrix4(body.matrixWorld).applyMatrix4(inv);
      if(P.y>=PY0&&P.y<PY0+PH*PYC){
        const px=P.x,pz=P.z-MASK_WRAP.cz,r=Math.hypot(px,pz);
        if(r<.2){const b=Math.floor((Math.atan2(px,pz)+Math.PI)/(2*Math.PI)*PB)%PB,row=Math.floor((P.y-PY0)/PYC);if(r>praw[row*PB+b]){praw[row*PB+b]=r;pcls[row*PB+b]=classify(i);}}
      }
      const cx=Math.round((P.x-GX0)/CELL),cy=Math.round((P.y-GY0)/CELL);
      if(cx<0||cy<0||cx>=GW||cy>=GH||P.z<-.02)continue;
      if(P.z>raw[cy*GW+cx])raw[cy*GW+cx]=P.z;
    }
  }
  function smoothField(radius){
    const f=Float32Array.from(raw);
    for(let pass=0;pass<40;pass++){   /* fill empty cells from their neighbours */
      let empty=0;
      for(let y=0;y<GH;y++)for(let x=0;x<GW;x++)if(f[y*GW+x]<-5){
        let s=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<GW&&Y<GH&&f[Y*GW+X]>-5){s+=f[Y*GW+X];c++;}}
        if(c)f[y*GW+x]=s/c;else empty++;
      }
      if(!empty)break;
    }
    const grown=Float32Array.from(f),g=Float32Array.from(f),G=MASK_FACE.grow;
    for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
      let m=-9;for(let dy=-G;dy<=G;dy++)for(let dx=-G;dx<=G;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<GW&&Y<GH)m=Math.max(m,f[Y*GW+X]);}
      grown[y*GW+x]=m;
    }
    for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
      let s=0,c=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<GW&&Y<GH&&grown[Y*GW+X]>-5){s+=grown[Y*GW+X];c++;}}
      g[y*GW+x]=c?s/c:-9;
    }
    return g;
  }
  function polarField(){
    const W=MASK_WRAP,f=Float32Array.from(praw);
    for(let pass=0;pass<60;pass++){
      let empty=0;
      for(let y=0;y<PH;y++)for(let b=0;b<PB;b++)if(f[y*PB+b]<-5){
        let s=0,c=0;for(let dy=-1;dy<=1;dy++)for(let db=-1;db<=1;db++){const Y=y+dy,B=(b+db+PB)%PB;if(Y>=0&&Y<PH&&f[Y*PB+B]>-5){s+=f[Y*PB+B];c++;}}
        if(c)f[y*PB+b]=s/c;else empty++;
      }
      if(!empty)break;
    }
    const grown=Float32Array.from(f),g=Float32Array.from(f);
    for(let y=0;y<PH;y++)for(let b=0;b<PB;b++){
      let m=-9;for(let dy=0;dy<=W.grow;dy++)for(let db=-W.grow;db<=W.grow;db++){const Y=y+dy,B=(b+db+PB)%PB;if(Y>=0&&Y<PH)m=Math.max(m,f[Y*PB+B]);}   /* only rows at/above: the garment below must not inflate the neck */
      grown[y*PB+b]=m;
    }
    for(let y=0;y<PH;y++)for(let b=0;b<PB;b++){
      let s=0,c=0;for(let dy=0;dy<=W.blur;dy++)for(let db=-W.blur;db<=W.blur;db++){const Y=y+dy,B=(b+db+PB)%PB;if(Y>=0&&Y<PH&&grown[Y*PB+B]>-5){s+=grown[Y*PB+B];c++;}}
      g[y*PB+b]=c?s/c:-9;
    }
    return g;
  }
  function filledPolar(){
    const f=Float32Array.from(praw);
    for(let pass=0;pass<60;pass++){
      let empty=0;
      for(let y=0;y<PH;y++)for(let b=0;b<PB;b++)if(f[y*PB+b]<-5){
        let s=0,c=0;for(let dy=-1;dy<=1;dy++)for(let db=-1;db<=1;db++){const Y=y+dy,B=(b+db+PB)%PB;if(Y>=0&&Y<PH&&f[Y*PB+B]>-5){s+=f[Y*PB+B];c++;}}
        if(c)f[y*PB+b]=s/c;else empty++;
      }
      if(!empty)break;
    }
    const lo=Float32Array.from(f);   /* 1-cell min: the inset stays inside the garment */
    for(let y=0;y<PH;y++)for(let b=0;b<PB;b++){
      let mn=9;for(let dy=-1;dy<=1;dy++)for(let db=-1;db<=1;db++){const Y=y+dy,B=(b+db+PB)%PB;if(Y>=0&&Y<PH)mn=Math.min(mn,f[Y*PB+B]);}
      lo[y*PB+b]=mn;
    }
    return {f,lo};
  }
  function collarCut(){
    const C=MASK_COLLAR,top=Math.min(PH-1,Math.floor((C.scan-PY0)/PYC)),cut=new Float32Array(PB).fill(NaN);
    for(let b=0;b<PB;b++){
      let seen=0,run=0,start=-1;
      for(let row=top;row>=0;row--){
        const c=pcls[row*PB+b];
        if(c<0)continue;
        if(c===2){seen++;run=0;continue;}
        if(run===0&&seen<2)continue;   /* anything above the neck skin (hair, incl. its grey highlights) is covered, not tucked under */
        if(run===0)start=row;
        if(++run>=C.run){cut[b]=PY0+(start+1)*PYC;break;}
      }
    }
    for(let pass=0;pass<PB&&cut.some(Number.isNaN);pass++)   /* directions with no collar found: take the neighbours' */
      for(let b=0;b<PB;b++)if(Number.isNaN(cut[b])){const l=cut[(b+PB-1)%PB],r=cut[(b+1)%PB];if(!Number.isNaN(l)||!Number.isNaN(r))cut[b]=Number.isNaN(l)?r:Number.isNaN(r)?l:(l+r)/2;}
    const med=new Float32Array(PB);   /* median of 5 removes single-cell texture speckles */
    for(let b=0;b<PB;b++){const w=[-2,-1,0,1,2].map(d=>cut[(b+d+PB)%PB]).sort((p,q)=>p-q);med[b]=w[2];}
    return med;
  }
  function coverField(f,cut){   /* max over neighbours ABOVE the collar line: a raised collar edge must not push the cloth out over it */
    const G=MASK_COLLAR.grow,hi=Float32Array.from(f);
    for(let y=0;y<PH;y++)for(let b=0;b<PB;b++){
      let mx=-9;
      for(let dy=-G;dy<=G;dy++)for(let db=-G;db<=G;db++){const Y=y+dy,B=(b+db+PB)%PB;if(Y>=0&&Y<PH&&PY0+(Y+.5)*PYC>=cut[B])mx=Math.max(mx,f[Y*PB+B]);}
      hi[y*PB+b]=mx>-5?mx:f[y*PB+b];
    }
    return hi;
  }
  function samplePolar(f,y,th){
    const fy=(y-PY0)/PYC,y0=Math.floor(fy),fb=(th+Math.PI)/(2*Math.PI)*PB-.5,b0=Math.floor(fb);
    if(y0<0||y0+1>=PH)return null;
    const ty=fy-y0,tb=fb-b0,B0=(b0+PB)%PB,B1=(b0+1+PB)%PB,a=f[y0*PB+B0],b=f[y0*PB+B1],c=f[(y0+1)*PB+B0],d=f[(y0+1)*PB+B1];
    if(a<-5||b<-5||c<-5||d<-5)return null;
    return (a*(1-tb)+b*tb)*(1-ty)+(c*(1-tb)+d*tb)*ty;
  }
  function sample(f,x,y){
    const fx=(x-GX0)/CELL,fy=(y-GY0)/CELL,x0=Math.floor(fx),y0=Math.floor(fy);
    if(x0<0||y0<0||x0+1>=GW||y0+1>=GH)return null;
    const tx=fx-x0,ty=fy-y0,a=f[y0*GW+x0],b=f[y0*GW+x0+1],c=f[(y0+1)*GW+x0],d=f[(y0+1)*GW+x0+1];
    if(a<-5||b<-5||c<-5||d<-5)return null;
    return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
  }
  function reshape(){
    const clamp01=t=>Math.max(0,Math.min(1,t));
    const F=MASK_FIT,N=MASK_NECK,smooth=t=>t*t*(3-2*t);
    const field=raw&&MASK_FACE.on?smoothField(MASK_FACE.blur):null;
    const pf=praw&&MASK_WRAP.on?polarField():null,W=MASK_WRAP,C=MASK_COLLAR;
    const pc=praw&&pcls&&C.on?filledPolar():null,cut=pc?collarCut():null;
    if(pc)pc.hi=coverField(pc.f,cut);
    accessory.collarLine=cut;
    for(const [attr,orig] of shaped){
      const a=attr.array,o=orig;
      for(let i=0;i<o.length;i+=3){
        const x=o[i]*F.sx+F.x,y=o[i+1]*F.sy+F.y,z=o[i+2]*F.sz+F.z;
        let nx=x,nz=z,ws=0;
        if(pf){   /* sides / back: radial fit */
          const th=Math.atan2(nx,nz-W.cz),ath=Math.abs(th),r=Math.hypot(nx,nz-W.cz);
          ws=smooth(clamp01((ath-.9)/.6));
          if(ws>0){
            const rp=samplePolar(pf,Math.max(y,W.neckY),th);   /* below the jaw: the neck radius, not the collar lip */
            if(rp!==null){
              const rn=r+(rp+W.side-r)*ws;   /* from the angle, not by scaling: r can be ~0 */
              nx=rn*Math.sin(th);nz=W.cz+rn*Math.cos(th);
            }
          }
        }
        if(field){   /* front of the face: lie on the skin */
          const w=smooth(clamp01((z-N.cz)/.03))*smooth(clamp01((y-1.44)/.03))*smooth(clamp01((.1-Math.abs(x))/.02));
          if(w>0){const zf=sample(field,x,y);if(zf!==null)nz=z+(zf+MASK_FACE.off-z)*w;}
        }
        if(y<N.y0){
          const w=smooth(Math.min(1,(N.y0-y)/(N.y0-N.y1))),n=1-N.tail*smooth(Math.max(0,Math.min(1,(N.y1-y)/(N.y1-N.hem)))),dx=nx/(N.rx*n),dz=(nz-N.cz)/(N.rz*n),rho=Math.hypot(dx,dz);
          if(rho>1){const k=1+(1/rho-1)*w;nx=nx*k;nz=N.cz+(nz-N.cz)*k;}
        }
        if(cut&&y<C.top){   /* collar: hug the skin above the collar line, dive under the garment below it */
          const th=Math.atan2(nx,nz-W.cz),r=Math.hypot(nx,nz-W.cz),fb=(th+Math.PI)/(2*Math.PI)*PB-.5,b0=Math.floor(fb),t=fb-b0;
          const yc=cut[(b0+PB)%PB]*(1-t)+cut[(b0+1)%PB]*t;
          let rn=null;
          if(y<yc){const rl=samplePolar(pc.lo,y,th);if(rl!==null)rn=Math.min(r,rl-C.inset);}
          else{const rh=samplePolar(pc.hi,y,th);if(rh!==null)rn=r+(rh+C.off-r)*smooth(clamp01((C.top-y)/.012));}
          if(rn!==null){nx=rn*Math.sin(th);nz=W.cz+rn*Math.cos(th);}
        }
        let ny=y;
        if(pf&&MASK_TRIM.on){   /* trim: nothing over the ears / occiput. Cloth above the line is folded down onto it (clean edge) */
          const T=MASK_TRIM,th=Math.atan2(nx,nz-W.cz),ath=Math.abs(th);
          if(ath>T.front){
            const yt=T.yFront+(T.yBack-T.yFront)*smooth(clamp01((ath-T.front)/(T.back-T.front)));
            if(y>yt){
              ny=yt;
              const rp=samplePolar(pf,Math.max(yt,W.neckY),th);
              if(rp!==null){const r=Math.hypot(nx,nz-W.cz),rn=r+(rp+W.side-r)*Math.max(ws,smooth(clamp01((ath-T.front)/.2)));nx=rn*Math.sin(th);nz=W.cz+rn*Math.cos(th);}
            }
          }
        }
        if(y<N.yb){   /* back of the neck: the rear hem stops at the top of the grey collar (yb) */
          const b=smooth(Math.max(0,Math.min(1,(N.cz-nz)/.04)));ny=N.yb-(N.yb-y)*(1-N.back*b);
        }
        if(ws>0)ny+=W.lift*ws*smooth(clamp01((y-1.57)/.05));   /* rim up over the ears / occiput; starts above the neck so the collar hem stays put */
        a[i]=(nx-F.x)/F.sx;a[i+1]=(ny-F.y)/F.sy;a[i+2]=(nz-F.z)/F.sz;
      }
      attr.needsUpdate=true;
    }
  }
  function update(){
    if(!group.visible || accessory.status!=='ready')return;
    rootInv.copy(root.matrixWorld).invert();
    group.matrix.multiplyMatrices(rootInv,headM.multiplyMatrices(head.matrixWorld,local));
    group.matrixWorldNeedsUpdate=true;
  }
  function load(){
    accessory.status='loading';accessory.error=null;
    accessory.ready=(async()=>{
      const response=await fetch('/assets/mask.glb',{cache:'no-cache'});
      if(!response.ok)throw new Error('Mask HTTP '+response.status);
      const buffer=await response.arrayBuffer(),gltf=await new GLTFLoader().parseAsync(buffer,'');
      const json=gltf.parser.json,source=json.materials[0],pbr=source.pbrMetallicRoughness;
      const decode=index=>index==null?null:loadTexture(buffer,json.textures[index].source);
      const [map,normalMap]=await Promise.all([decode(pbr.baseColorTexture?.index),decode(source.normalTexture?.index)]);
      if(map)map.anisotropy=8;
      const material=new THREE.MeshStandardMaterial({map,normalMap,normalScale:new THREE.Vector2(.6,.6),roughness:.95,metalness:0,side:THREE.FrontSide});   /* FrontSide: the shaping lays the cloth's inner and outer walls onto the same surface; DoubleSide z-fights them into grey blotches */
      gltf.scene.traverse(object=>{if(object.isMesh){const at=object.geometry.attributes.position;shaped.push([at,at.array.slice()]);object.material=material;object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;}});
      refit();skinField();reshape();group.add(gltf.scene);
      accessory.status='ready';onReady();return accessory;
    })().catch(error=>{accessory.status='error';accessory.error=error;console.error('[Mask]',error);onReady();return accessory;});
    return accessory.ready;
  }
  load();return accessory;
}
