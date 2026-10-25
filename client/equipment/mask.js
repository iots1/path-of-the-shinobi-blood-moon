import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {encodeRigidTransform,transformBlendedPoint} from '../rig/volume_skinning_math.mjs';

// Face/neck gaiter (assets/mask.glb, native size ~1.3 x 1.9 x 1.75 m, front = +Z like the character).
// Separate skinned accessory: face follows Head; the tucked hem shares the shirt’s local bone weights.
// Existing character bones/assets are read only. Source topology, UVs and embedded textures stay intact.
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
// Above yc the neck band targets skin + `off` (through the smooth field); below it the cloth continues as a neck tube
// and the shader clips it `clip` under the line. Every vertex follows the weights of the body surface under it.
export const MASK_COLLAR={on:true,scan:1.545,top:1.545,run:3,off:.006,grow:2,clip:.002};   /* grow = max-filter over cells above the collar line only; clip = cloth kept under the collar lip */
// Upper edge = the source's own sewn rim, lowered at the ears by a smooth vertical squash (see mapPoint).
// The back of the head and the ears stay bare, matching ninja_side.jpeg. No source vertices are folded onto one y plane.
export const MASK_TRIM={on:true,y0:1.5,kFront:.86,k:.5,a0:.9,a1:1.35,a2:1.9,a3:2.2,backLift:.018};   /* side squash: angles in rad from the front (ears ~1.6–1.8) */
// Cavity shading from the source relief (see sourceRelief): x = multiplicative contrast, y = added light on ridges.
export const MASK_RELIEF={x:.5,y:.25};
const PB=120,PY0=1.4,PYC=.003,PH=107;
const GX0=-.1,GY0=1.4,CELL=.003,GW=67,GH=82;
export function createMask({THREE,root,real,loadTexture,onReady=()=>{}}){
  const group=new THREE.Group();group.name='equipment-mask';group.matrixAutoUpdate=false;root.add(group);
  const head=real.bone.Head,rootInv=new THREE.Matrix4(),fit=new THREE.Matrix4();
  const accessory={group,status:'loading',error:null,ready:null,update,load,fit:MASK_FIT,neck:MASK_NECK,face:MASK_FACE,wrap:MASK_WRAP,collar:MASK_COLLAR,trim:MASK_TRIM,refit,reshape,getVertexPosition,collisionCapsule};
  let raw=null,praw=null,pcls=null,pindex=null,body=null;
  let shaped=[],sourceFront=null,sourcePolar=null,context=null,fitField=null;
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  function refit(){
    fit.compose(new THREE.Vector3(MASK_FIT.x,MASK_FIT.y,MASK_FIT.z),new THREE.Quaternion(),new THREE.Vector3(MASK_FIT.sx,MASK_FIT.sy,MASK_FIT.sz));
    if(shaped.length&&raw){sourceFields();reshape();}
  }
  function skinField(){
    body=null;
    root.traverse(o=>{if(o.isSkinnedMesh&&!/^equipment-/.test(o.parent?.name||'')&&(!body||o.geometry.attributes.position.count>body.geometry.attributes.position.count))body=o;});
    if(!body)return;
    root.updateMatrixWorld(true);real.skinning?.update();body.skeleton.update();
    const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(),P=new THREE.Vector3(),n=body.geometry.attributes.position.count;
    raw=new Float32Array(GW*GH).fill(-9);praw=new Float32Array(PB*PH).fill(-9);pcls=new Int8Array(PB*PH).fill(-1);pindex=new Int32Array(PB*PH).fill(-1);
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
      (real.skinning?.getVertexPosition?real.skinning.getVertexPosition(i,P):body.getVertexPosition(i,P)).applyMatrix4(body.matrixWorld).applyMatrix4(inv);
      if(P.y>=PY0&&P.y<PY0+PH*PYC){
        const px=P.x,pz=P.z-MASK_WRAP.cz,r=Math.hypot(px,pz);
        if(r<.2){const b=Math.floor((Math.atan2(px,pz)+Math.PI)/(2*Math.PI)*PB)%PB,row=Math.floor((P.y-PY0)/PYC);if(r>praw[row*PB+b]){praw[row*PB+b]=r;pcls[row*PB+b]=classify(i);pindex[row*PB+b]=i;}}
      }
      const cx=Math.round((P.x-GX0)/CELL),cy=Math.round((P.y-GY0)/CELL);
      if(cx<0||cy<0||cx>=GW||cy>=GH||P.z<-.02)continue;
      if(P.z>raw[cy*GW+cx])raw[cy*GW+cx]=P.z;
    }
  }
  function smoothField(radius,input=raw,grow=MASK_FACE.grow){
    const f=Float32Array.from(input);
    for(let pass=0;pass<40;pass++){   /* fill empty cells from their neighbours */
      let empty=0;
      for(let y=0;y<GH;y++)for(let x=0;x<GW;x++)if(f[y*GW+x]<-5){
        let s=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<GW&&Y<GH&&f[Y*GW+X]>-5){s+=f[Y*GW+X];c++;}}
        if(c)f[y*GW+x]=s/c;else empty++;
      }
      if(!empty)break;
    }
    const grown=Float32Array.from(f),g=Float32Array.from(f),G=grow;
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
  function filledPolar(input=praw){
    const f=Float32Array.from(input);
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
  function sourceFields(){
    const F=MASK_FIT,W=MASK_WRAP,sr=new Float32Array(GW*GH).fill(-9),sp=new Float32Array(PB*PH).fill(-9);
    for(const record of shaped){const o=record.original;for(let i=0;i<o.length;i+=3){
      const x=o[i]*F.sx+F.x,y=o[i+1]*F.sy+F.y,z=o[i+2]*F.sz+F.z,th=Math.atan2(x,z-W.cz),b=(Math.floor((th+Math.PI)/(2*Math.PI)*PB)+PB)%PB;
      const row=Math.floor((y-PY0)/PYC);if(row>=0&&row<PH)sp[row*PB+b]=Math.max(sp[row*PB+b],Math.hypot(x,z-W.cz));
      const cx=Math.round((x-GX0)/CELL),cy=Math.round((y-GY0)/CELL);
      if(cx>=0&&cy>=0&&cx<GW&&cy<GH&&z>-.02)sr[cy*GW+cx]=Math.max(sr[cy*GW+cx],z);
    }}
    sourceFront=smoothField(1,sr,0);sourcePolar=filledPolar(sp).f;
  }
  function angleSample(values,th){
    const fb=(th+Math.PI)/(2*Math.PI)*PB-.5,b0=Math.floor(fb),t=fb-b0;
    return values[(b0+PB)%PB]*(1-t)+values[(b0+1+PB)%PB]*t;
  }
  function mapPoint(x0,y0,z0,out){
    const F=MASK_FIT,N=MASK_NECK,W=MASK_WRAP,C=MASK_COLLAR,T=MASK_TRIM;
    const x=x0*F.sx+F.x,originalY=y0*F.sy+F.y,z=z0*F.sz+F.z;
    const theta0=Math.atan2(x,z-W.cz),ath0=Math.abs(theta0),sourceR=Math.hypot(x,z-W.cz);
    let y=originalY,nx=x,nz=z,ws=0;
    // Ears bare (ninja_side.jpeg): squash the side panels vertically above T.y0 by T.k, fading in over the cheek and out
    // towards the nape, where the source's own back rim already sits at the nape (~1.548). One smooth map of position,
    // sampled into the field like everything else, so the stitched rim and its folds move together. (The old per-angle
    // "relative to this bin's highest vertex" warp dropped the back rim under the collar where a bin held both the horn
    // and the low back rim, leaving a skin gap at the nape.)
    if(T.on&&originalY>T.y0){
      const front=1-smooth((ath0-T.a0)/(T.a1-T.a0)),side=(1-front)*(1-smooth((ath0-T.a2)/(T.a3-T.a2)));
      y=T.y0+(originalY-T.y0)*(1-(1-T.kFront)*front-(1-T.k)*side);   /* kFront: less of the face covered (user, 2026-10-25) */
      y+=T.backLift*smooth((ath0-T.a2)/(T.a3-T.a2))*smooth((originalY-T.y0)/.04);   /* nape rim up under the hairline corners */
    }
    if(context.pf){
      ws=smooth((ath0-.9)/.6);
      if(ws>0){const grown=samplePolar(context.pf,Math.max(y,W.neckY),theta0),own=context.pc?samplePolar(context.pc.f,Math.max(y,W.neckY),theta0):null,wb=smooth((ath0-1.9)/.4),rp=grown===null||own===null?grown:grown+(own-grown)*wb,   /* nape: the surface at this height, not the hair overhang above — the band hugs the neck and slides under the hair */
        ref=samplePolar(sourcePolar,Math.max(PY0+.004,Math.min(PY0+(PH-2)*PYC,originalY)),theta0);
        if(rp!==null){const target=rp+W.side+.25*(sourceR-(ref??sourceR)),rn=sourceR+(target-sourceR)*ws;nx=rn*Math.sin(theta0);nz=W.cz+rn*Math.cos(theta0);}
      }
    }
    if(context.field){
      const w=smooth((z-N.cz)/.03)*smooth((y-1.44)/.03)*smooth((.1-Math.abs(x))/.02);
      if(w>0){const zf=sample(context.field,x,y),ref=sample(sourceFront,x,originalY);if(zf!==null)nz=z+(zf+MASK_FACE.off+.25*(z-(ref??z))-z)*w;}
    }
    if(y<N.y0){
      const w=smooth((N.y0-y)/(N.y0-N.y1)),n=1-N.tail*smooth((N.y1-y)/(N.y1-N.hem));
      const rho=Math.hypot(nx/(N.rx*n),(nz-N.cz)/(N.rz*n));
      if(rho>1){const k=1+(1/rho-1)*w;nx*=k;nz=N.cz+(nz-N.cz)*k;}
    }
    if(context.cut&&y<C.top+.025){
      // Neck band: lie `off` outside the neck skin. Below the collar line keep the skin radius measured just above the
      // line (a neck tube, no tuck/fold); the shader clips it at the collar line (see installSkin), so no part of the
      // cloth is drawn over the grey and no per-vertex projection touches the visible surface.
      const th=Math.atan2(nx,nz-W.cz),r=Math.hypot(nx,nz-W.cz),yc=angleSample(context.cut,th);
      const hi=samplePolar(context.pc.hi,Math.max(y,yc+.004),th);
      if(hi!==null){
        const amount=1-smooth((y-C.top+.012)/.037),rn=r+(hi+C.off-r)*amount;
        nx=rn*Math.sin(th);nz=W.cz+rn*Math.cos(th);
      }
    }
    out[0]=nx;out[1]=y;out[2]=nz;return out;
  }
  function skinWeights(mesh,positions){
    const count=positions.length/3,indices=new Uint16Array(count*4),weights=new Float32Array(count*4),follow=new Float32Array(count);
    const headIndex=body.skeleton.bones.indexOf(head),bi=body.geometry.attributes.skinIndex,bw=body.geometry.attributes.skinWeight;
    for(let i=0;i<count;i++){
      const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2],th=Math.atan2(x,z-MASK_WRAP.cz),bin=(Math.floor((th+Math.PI)/(2*Math.PI)*PB)+PB)%PB;
      const yc=context.cut?angleSample(context.cut,th):1.48;
      // Every vertex copies the weights of the body surface it lies on (face -> Head, neck skin -> Neck, tucked hem ->
      // garment). A Head-only neck band let the neck skin poke through when the head tilted (combo beat 1).
      const w=1,sampleY=y<yc?Math.min(y,yc-.006):y;
      let row=Math.max(0,Math.min(PH-1,Math.floor((sampleY-PY0)/PYC))),nearest=-1,distance=Infinity;
      if(w>0)for(let dy=-3;dy<=3;dy++)for(let db=-3;db<=3;db++){
        const rr=row+dy;if(rr<0||rr>=PH)continue;const id=pindex[rr*PB+(bin+db+PB)%PB];if(id<0)continue;
        const score=dy*dy+db*db;if(score<distance){distance=score;nearest=id;}
      }
      const mix=new Map([[headIndex,1-w]]);
      if(nearest>=0)for(let k=0;k<4;k++){const id=bi.array[nearest*4+k],value=bw.array[nearest*4+k]*w;mix.set(id,(mix.get(id)||0)+value);}
      else mix.set(headIndex,1);
      const best=[...mix].filter(([,v])=>v>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4),total=best.reduce((n,p)=>n+p[1],0);
      for(let k=0;k<4;k++){indices[i*4+k]=best[k]?.[0]??headIndex;weights[i*4+k]=(best[k]?.[1]??0)/total;}
      follow[i]=w;
    }
    mesh.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    mesh.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    mesh.geometry.setAttribute('maskCollarFollow',new THREE.Float32BufferAttribute(follow,1));
  }
  function toBodyBind(mesh,positions,normals){
    // Inverting each bone before blending is not inverse blended DQ. Unpose each
    // fitted vertex through its CURRENT blended body DQ once, then share the
    // body's original bind convention. The tucked cloth then moves exactly with
    // the garment sample even when Head and torso rotate relative to each other.
    root.updateMatrixWorld(true);real.skinning.update();
    const bindInverse=body.bindMatrix.clone().invert(),rootToBind=body.bindMatrixInverse.clone().invert().multiply(body.matrixWorld.clone().invert()).multiply(root.matrixWorld),normalToBind=new THREE.Matrix3().getNormalMatrix(rootToBind),normalFromBind=new THREE.Matrix3().getNormalMatrix(bindInverse);
    const ids=mesh.geometry.attributes.skinIndex.array,weights=mesh.geometry.attributes.skinWeight.array,sourceR=real.skinning.real,sourceD=real.skinning.dual;
    const r=new Float64Array(4),d=new Float64Array(4),point=new THREE.Vector3(),normal=new THREE.Vector3(),translation=new THREE.Vector3(),inverseQ=new THREE.Quaternion();
    for(let i=0;i<positions.length/3;i++){
      r.fill(0);d.fill(0);const reference=ids[i*4]*4;
      for(let k=0;k<4;k++){
        const offset=ids[i*4+k]*4,dot=sourceR[reference]*sourceR[offset]+sourceR[reference+1]*sourceR[offset+1]+sourceR[reference+2]*sourceR[offset+2]+sourceR[reference+3]*sourceR[offset+3],weight=weights[i*4+k]*(dot<0?-1:1);
        for(let c=0;c<4;c++){r[c]+=sourceR[offset+c]*weight;d[c]+=sourceD[offset+c]*weight;}
      }
      const length=Math.hypot(...r)||1;for(let c=0;c<4;c++){r[c]/=length;d[c]/=length;}const rd=r[0]*d[0]+r[1]*d[1]+r[2]*d[2]+r[3]*d[3];for(let c=0;c<4;c++)d[c]-=r[c]*rd;
      translation.set(2*(r[3]*d[0]-d[3]*r[0]+r[1]*d[2]-r[2]*d[1]),2*(r[3]*d[1]-d[3]*r[1]+r[2]*d[0]-r[0]*d[2]),2*(r[3]*d[2]-d[3]*r[2]+r[0]*d[1]-r[1]*d[0]));inverseQ.set(-r[0],-r[1],-r[2],r[3]);
      point.fromArray(positions,i*3).applyMatrix4(rootToBind).sub(translation).applyQuaternion(inverseQ).applyMatrix4(bindInverse).toArray(positions,i*3);
      normal.fromArray(normals,i*3).applyMatrix3(normalToBind).applyQuaternion(inverseQ).applyMatrix3(normalFromBind).normalize().toArray(normals,i*3);
    }
    mesh.matrix.copy(root.matrixWorld.clone().invert().multiply(body.matrixWorld));mesh.matrixAutoUpdate=false;mesh.updateMatrixWorld(true);
  }
  // Stitches, rolled hems and folds are geometry in the source (its textures are a flat weave). Under the game's ink
  // lighting their 1–2 mm relief barely shades on black cloth, so read it back as a cavity term: signed curvature of the
  // SOURCE surface (umbrella Laplacian on UV-welded vertices, so the atlas seams leave no lines), robustly normalised.
  function sourceRelief(record){
    const o=record.original,n=record.normals,index=record.mesh.geometry.index?.array,count=o.length/3,F=MASK_FIT;
    const relief=new Float32Array(count);if(!index)return relief;
    const weld=new Int32Array(count),keys=new Map();let welded=0;
    for(let i=0;i<count;i++){const key=Math.round(o[i*3]*1e5)+','+Math.round(o[i*3+1]*1e5)+','+Math.round(o[i*3+2]*1e5);let id=keys.get(key);if(id===undefined){id=welded++;keys.set(key,id);}weld[i]=id;}
    const pos=new Float64Array(welded*3),nor=new Float64Array(welded*3),sum=new Float64Array(welded*3),deg=new Float64Array(welded),len=new Float64Array(welded);
    for(let i=0;i<count;i++){const w=weld[i]*3;pos[w]=o[i*3]*F.sx;pos[w+1]=o[i*3+1]*F.sy;pos[w+2]=o[i*3+2]*F.sz;nor[w]+=n[i*3]/F.sx;nor[w+1]+=n[i*3+1]/F.sy;nor[w+2]+=n[i*3+2]/F.sz;}
    for(let t=0;t<index.length;t+=3)for(let e=0;e<3;e++){
      const a=weld[index[t+e]],b=weld[index[t+(e+1)%3]];if(a===b)continue;
      const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2],l=Math.hypot(dx,dy,dz);
      sum[a*3]+=dx;sum[a*3+1]+=dy;sum[a*3+2]+=dz;deg[a]++;len[a]+=l;sum[b*3]-=dx;sum[b*3+1]-=dy;sum[b*3+2]-=dz;deg[b]++;len[b]+=l;
    }
    const curv=new Float32Array(welded);
    for(let w=0;w<welded;w++){
      if(!deg[w])continue;const nl=Math.hypot(nor[w*3],nor[w*3+1],nor[w*3+2])||1,edge=len[w]/deg[w]||1;
      curv[w]=-(sum[w*3]*nor[w*3]+sum[w*3+1]*nor[w*3+1]+sum[w*3+2]*nor[w*3+2])/(nl*deg[w]*edge);   /* + = ridge / outer roll edge */
    }
    const sorted=Float32Array.from(curv).sort(),scale=Math.max(Math.abs(sorted[Math.floor(welded*.02)]),Math.abs(sorted[Math.floor(welded*.98)]))||1;
    for(let i=0;i<count;i++)relief[i]=Math.max(-1,Math.min(1,curv[weld[i]]/scale));
    return relief;
  }
  function clipLine(){   /* collar line for the clip: the median cut, circular box blur over ±3 bins (~9°) for a clean curve */
    const cut=context.cut,out=new Float32Array(PB);if(!cut)return out.fill(-9);
    for(let b=0;b<PB;b++){let sum=0;for(let d=-3;d<=3;d++)sum+=cut[(b+d+PB)%PB];out[b]=sum/7;}
    return out;
  }
  function installSkin(mesh){
    mesh.customDepthMaterial?.dispose();mesh.customDistanceMaterial?.dispose();
    const bones=body.skeleton.bones,inverses=body.skeleton.boneInverses.map(m=>m.clone());
    const skeleton=new THREE.Skeleton(bones,inverses);mesh.bind(skeleton,body.bindMatrix.clone());
    const count=bones.length,r=new Float32Array(count*4),d=new Float32Array(count*4),uniforms={maskDqReal:{value:r},maskDqDual:{value:d},maskDqAmount:{value:1},maskCut:{value:clipLine()},maskClip:{value:MASK_COLLAR.clip}};
    const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
    const used=[...new Set(mesh.geometry.attributes.skinIndex.array)],signature=new Float64Array(used.length*16).fill(NaN);
    const state={r,d,uniforms,update(){
      let changed=false;for(let i=0;i<used.length;i++)for(let c=0;c<16;c++){const value=bones[used[i]].matrixWorld.elements[c],k=i*16+c;if(value!==signature[k]){signature[k]=value;changed=true;}}
      if(!changed)return;
      skeleton.update();let rigid=true;
      for(let i=0;i<count;i++){matrix.fromArray(skeleton.boneMatrices,i*16).decompose(p,q,scale);q.normalize();if(Math.max(Math.abs(scale.x-1),Math.abs(scale.y-1),Math.abs(scale.z-1))>.002)rigid=false;encodeRigidTransform(p,q,r,d,i*4);}
      uniforms.maskDqAmount.value=rigid&&real.skinning?.enabled!==false?1:0;
    }};
    const declarations=`
#ifdef USE_SKINNING
uniform vec4 maskDqReal[${count}];uniform vec4 maskDqDual[${count}];uniform float maskDqAmount;
vec4 maskMultiply(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec3 maskRotate(vec4 r,vec3 v){return v+2.0*cross(r.xyz,cross(r.xyz,v)+r.w*v);}
void maskBlend(out vec4 r,out vec4 d){ivec4 idx=ivec4(skinIndex);vec4 ref=maskDqReal[idx.x];vec4 signs=vec4(1.0,dot(ref,maskDqReal[idx.y])<0.0?-1.0:1.0,dot(ref,maskDqReal[idx.z])<0.0?-1.0:1.0,dot(ref,maskDqReal[idx.w])<0.0?-1.0:1.0);vec4 w=skinWeight*signs;r=maskDqReal[idx.x]*w.x+maskDqReal[idx.y]*w.y+maskDqReal[idx.z]*w.z+maskDqReal[idx.w]*w.w;d=maskDqDual[idx.x]*w.x+maskDqDual[idx.y]*w.y+maskDqDual[idx.z]*w.z+maskDqDual[idx.w]*w.w;float n=max(length(r),.00001);r/=n;d/=n;d-=r*dot(r,d);}
#endif
`;
    const position=`
#ifdef USE_SKINNING
vec4 skinVertex=bindMatrix*vec4(transformed,1.0);vec4 linearSkinned=boneMatX*skinVertex*skinWeight.x+boneMatY*skinVertex*skinWeight.y+boneMatZ*skinVertex*skinWeight.z+boneMatW*skinVertex*skinWeight.w;
vec4 maskR,maskD;maskBlend(maskR,maskD);vec3 maskTranslation=2.0*maskMultiply(maskD,vec4(-maskR.xyz,maskR.w)).xyz;vec3 maskSkinned=maskRotate(maskR,skinVertex.xyz)+maskTranslation;transformed=(bindMatrixInverse*vec4(mix(linearSkinned.xyz,maskSkinned,maskDqAmount),1.0)).xyz;
#endif
`;
    const normal=`
#ifdef USE_SKINNING
mat4 skinMatrix=skinWeight.x*boneMatX+skinWeight.y*boneMatY+skinWeight.z*boneMatZ+skinWeight.w*boneMatW;vec4 maskNR,maskND;maskBlend(maskNR,maskND);vec3 maskBindNormal=(bindMatrix*vec4(objectNormal,0.0)).xyz;objectNormal=(bindMatrixInverse*vec4(mix((skinMatrix*vec4(maskBindNormal,0.0)).xyz,maskRotate(maskNR,maskBindNormal),maskDqAmount),0.0)).xyz;
#ifdef USE_TANGENT
vec3 maskBindTangent=(bindMatrix*vec4(objectTangent,0.0)).xyz;objectTangent=(bindMatrixInverse*vec4(mix((skinMatrix*vec4(maskBindTangent,0.0)).xyz,maskRotate(maskNR,maskBindTangent),maskDqAmount),0.0)).xyz;
#endif
#endif
`;
    // Collar clip: the cloth below the collar line (in the fitted rest position, so it follows the skin in every pose)
    // is not drawn. Interpolated per fragment => a smooth edge along the collar instead of a jagged depth intersection.
    const clipVertex='attribute vec3 maskRest;\nvarying vec3 vMaskRest;\n',clipFragment=`varying vec3 vMaskRest;uniform float maskCut[${PB}];uniform float maskClip;\n`;
    const clipTest=`void main() {
  {float th=atan(vMaskRest.x,vMaskRest.z-(${MASK_WRAP.cz.toFixed(4)}));float fb=(th+3.14159265)/6.2831853*${PB}.0-.5;float b0=floor(fb);
   int i0=int(mod(b0,${PB}.0)),i1=int(mod(b0+1.,${PB}.0));if(vMaskRest.y<mix(maskCut[i0],maskCut[i1],fb-b0)-maskClip)discard;}`;
    mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});mesh.customDistanceMaterial=new THREE.MeshDistanceMaterial();
    for(const material of [mesh.material,mesh.customDepthMaterial,mesh.customDistanceMaterial]){
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=clipVertex+shader.vertexShader.replace('#include <skinning_pars_vertex>','#include <skinning_pars_vertex>'+declarations).replace('#include <skinning_vertex>',position).replace('#include <skinnormal_vertex>',normal).replace('#include <begin_vertex>','#include <begin_vertex>\nvMaskRest=maskRest;');
        shader.fragmentShader=clipFragment+shader.fragmentShader.replace('void main() {',clipTest);
        if(material===mesh.material){
          shader.uniforms.maskReliefGain={value:MASK_RELIEF};
          shader.vertexShader='attribute float maskRelief;\nvarying float vMaskRelief;\n'+shader.vertexShader.replace('vMaskRest=maskRest;','vMaskRest=maskRest;vMaskRelief=maskRelief;');
          shader.fragmentShader='varying float vMaskRelief;uniform vec2 maskReliefGain;\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n{float c=clamp(vMaskRelief,-1.,1.);diffuseColor.rgb=diffuseColor.rgb*(1.+maskReliefGain.x*c)+maskReliefGain.y*max(c,0.);}');
        }
      };
      material.customProgramCacheKey=()=>`mask-collar-dq-clip-relief-v3-${count}-${material===mesh.material}`;material.needsUpdate=true;
    }
    mesh.onBeforeRender=()=>state.update();mesh.onBeforeShadow=()=>state.update();mesh.userData.maskSkinning=state;state.update();
  }
  function buildFitField(){
    const step=.045,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],F=MASK_FIT;
    for(const record of shaped)for(let i=0;i<record.original.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],record.original[i+k]);max[k]=Math.max(max[k],record.original[i+k]);}
    const origin=min.map(v=>Math.floor(v/step)*step-4*step),size=max.map((v,k)=>Math.ceil((v-origin[k])/step)+5),[W,H,D]=size;
    let data=new Float32Array(W*H*D*3);const point=new Float64Array(3),scales=[F.sx,F.sy,F.sz],translation=[F.x,F.y,F.z];
    for(let z=0;z<D;z++)for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const p=[origin[0]+x*step,origin[1]+y*step,origin[2]+z*step],i=((z*H+y)*W+x)*3;mapPoint(...p,point);
      for(let k=0;k<3;k++)data[i+k]=point[k]-(p[k]*scales[k]+translation[k]);
    }
    // Smooth the deformation field, never the original mesh or stitched band.
    for(let pass=0;pass<2;pass++)for(let axis=0;axis<3;axis++){
      const next=new Float32Array(data.length),stride=[3,W*3,W*H*3][axis],limit=[W,H,D][axis];
      for(let z=0;z<D;z++)for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=((z*H+y)*W+x)*3,c=[x,y,z][axis],lo=c>0?i-stride:i,hi=c<limit-1?i+stride:i;
        for(let k=0;k<3;k++)next[i+k]=.25*data[lo+k]+.5*data[i+k]+.25*data[hi+k];
      }
      data=next;
    }
    fitField={step,origin,size,data,strength:1};
  }
  function sampleFit(x,y,z,out,jac){
    const {step,origin,size,data,strength}=fitField,[W,H]=size,F=MASK_FIT,points=[x,y,z],base=[],w=[],dw=[];
    for(let k=0;k<3;k++){
      const u=(points[k]-origin[k])/step,n=Math.floor(u),t=u-n;base[k]=n-1;
      w[k]=[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6];
      dw[k]=[-.5*(1-t)**2/step,(1.5*t*t-2*t)/step,(-1.5*t*t+t+.5)/step,.5*t*t/step];
    }
    out[0]=x*F.sx+F.x;out[1]=y*F.sy+F.y;out[2]=z*F.sz+F.z;
    jac.fill(0);jac[0]=F.sx;jac[4]=F.sy;jac[8]=F.sz;
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++){
      const o=(((base[2]+k)*H+base[1]+j)*W+base[0]+i)*3,weight=w[0][i]*w[1][j]*w[2][k]*strength;
      const dx=dw[0][i]*w[1][j]*w[2][k]*strength,dy=w[0][i]*dw[1][j]*w[2][k]*strength,dz=w[0][i]*w[1][j]*dw[2][k]*strength;
      for(let c=0;c<3;c++){const value=data[o+c];out[c]+=value*weight;jac[c]+=value*dx;jac[c+3]+=value*dy;jac[c+6]+=value*dz;}
    }
  }
  function reshape(){
    if(!body||!sourceFront)return;
    const field=raw&&MASK_FACE.on?smoothField(MASK_FACE.blur):null,pf=praw&&MASK_WRAP.on?polarField():null;
    const pc=praw&&pcls&&MASK_COLLAR.on?filledPolar():null,cut=pc?collarCut():null;if(pc)pc.hi=coverField(pc.f,cut);
    context={field,pf,pc,cut};accessory.collarLine=cut;buildFitField();
    const out=new Float64Array(3),jac=new Float64Array(9);let singular=0,negative=0,visibleNegative=0,minDet=Infinity;
    const F=MASK_FIT,scale=[F.sx,F.sy,F.sz],translation=[F.x,F.y,F.z],cache=[];
    for(const record of shaped){
      const o=record.original,positions=new Float32Array(o.length),matrices=new Float32Array(o.length*3);
      for(let i=0;i<o.length;i+=3){sampleFit(o[i],o[i+1],o[i+2],out,jac);positions.set(out,i);matrices.set(jac,i*3);}
      cache.push({positions,matrices});
    }
    // Fold-over check on the VISIBLE cloth only: the tube under the collar is clipped away (installSkin), so its
    // compression must not weaken the fit of the face and neck band (it held the whole field at 73 %).
    for(const entry of cache){
      const p=entry.positions,visible=new Uint8Array(p.length/3);
      for(let v=0;v<visible.length;v++){const th=Math.atan2(p[v*3],p[v*3+2]-MASK_WRAP.cz);visible[v]=!cut||p[v*3+1]>=angleSample(cut,th)-.01?1:0;}
      entry.visible=visible;
    }
    let strength=1,minimum=-Infinity;
    while(strength>=.2){
      minimum=Infinity;
      for(const {matrices,visible} of cache)for(let i=0;i<matrices.length;i+=9){
        if(!visible[i/9])continue;
        const ax=F.sx+(matrices[i]-F.sx)*strength,ay=matrices[i+1]*strength,az=matrices[i+2]*strength,bx=matrices[i+3]*strength,by=F.sy+(matrices[i+4]-F.sy)*strength,bz=matrices[i+5]*strength,cx=matrices[i+6]*strength,cy=matrices[i+7]*strength,cz=F.sz+(matrices[i+8]-F.sz)*strength;
        minimum=Math.min(minimum,(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/(F.sx*F.sy*F.sz));
      }
      if(minimum>.05)break;strength*=.9;
    }
    if(minimum<=0)throw new Error('Mask fitting would invert the visible source surface');
    fitField.strength=strength;
    const finished=[];
    for(let ri=0;ri<shaped.length;ri++){
      const record=shaped[ri],mesh=record.mesh,o=record.original,n=record.normals,positions=cache[ri].positions,matrices=cache[ri].matrices,normals=new Float32Array(n.length);
      for(let i=0;i<o.length;i+=3){
        for(let c=0;c<3;c++){const baseline=o[i+c]*scale[c]+translation[c];out[c]=baseline+strength*(positions[i+c]-baseline);positions[i+c]=out[c];}
        for(let k=0;k<9;k++){const diagonal=k===0?F.sx:k===4?F.sy:k===8?F.sz:0;jac[k]=diagonal+strength*(matrices[i*3+k]-diagonal);}
        const [ax,ay,az,bx,by,bz,cx,cy,cz]=jac;
        const c0x=by*cz-bz*cy,c0y=bz*cx-bx*cz,c0z=bx*cy-by*cx,c1x=cy*az-cz*ay,c1y=cz*ax-cx*az,c1z=cx*ay-cy*ax,c2x=ay*bz-az*by,c2y=az*bx-ax*bz,c2z=ax*by-ay*bx,det=ax*c0x+ay*c0y+az*c0z;
        minDet=Math.min(minDet,det/(MASK_FIT.sx*MASK_FIT.sy*MASK_FIT.sz));
        const th=Math.atan2(out[0],out[2]-MASK_WRAP.cz),yc=cut?angleSample(cut,th):1.48;
        if(det<=0){negative++;if(out[1]>yc+.012)visibleNegative++;}
        let nx,ny,nz;
        if(Math.abs(det)>1e-9){const sign=det<0?-1:1;nx=sign*(c0x*n[i]+c1x*n[i+1]+c2x*n[i+2]);ny=sign*(c0y*n[i]+c1y*n[i+1]+c2y*n[i+2]);nz=sign*(c0z*n[i]+c1z*n[i+1]+c2z*n[i+2]);}
        else{singular++;nx=n[i]/MASK_FIT.sx;ny=n[i+1]/MASK_FIT.sy;nz=n[i+2]/MASK_FIT.sz;}
        const length=Math.hypot(nx,ny,nz)||1;normals[i]=nx/length;normals[i+1]=ny/length;normals[i+2]=nz/length;
      }
      finished.push({mesh,positions,normals});
    }
    for(const {mesh,positions,normals} of finished){
      mesh.geometry.setAttribute('maskRest',new THREE.Float32BufferAttribute(positions.slice(),3));   /* fitted root-local position, for the collar clip */
      skinWeights(mesh,positions);toBodyBind(mesh,positions,normals);
      mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));mesh.geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      mesh.skeleton?.dispose();installSkin(mesh);mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    }
    accessory.diagnostics={sourceVertices:shaped.reduce((n,r)=>n+r.original.length/3,0),normalSingularVertices:singular,negativeJacobians:negative,visibleNegativeJacobians:visibleNegative,minNormalizedDeterminant:minDet,fieldStrength:strength,skinned:true};
    group.matrix.identity();group.matrixWorldNeedsUpdate=true;
  }
  function update(){
    // All dense deformation is done once at load/refit. Renderer callbacks update
    // only 70 joint transforms; the 4-ms gameplay substep never rewrites vertices.
    if(!group.visible||accessory.status!=='ready')return;
    group.matrixWorldNeedsUpdate=true;
  }
  // Keeps the cloak's hood/collar outside the mask (cloak.js adds this to its arm/sword capsules). The cloak was fitted
  // to the bare neck; its hood edge sat inside the mask's thickness behind the ears. Axis = neck -> Head bone, shifted
  // `forward` along the head's facing so one round capsule reaches ~5.5 cm behind the neck axis, ~6 cm on the rear
  // diagonals and ~8 cm at the sides — the mask's measured outer radii plus a few mm.
  const NECK_CAPSULE={forward:.035,r:.09,below:.02,above:.12},capsuleForward=new THREE.Vector3(),capsuleUp=new THREE.Vector3(),capsuleQ=new THREE.Quaternion();
  let headForward=null;
  function collisionCapsule(){
    if(!group.visible||accessory.status!=='ready')return null;
    const neck=real.bone.neck??real.bone.Neck;if(!neck)return null;
    if(!headForward){root.updateMatrixWorld(true);headForward=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(capsuleQ)).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());}
    const a=neck.getWorldPosition(new THREE.Vector3()),b=head.getWorldPosition(new THREE.Vector3());
    capsuleUp.subVectors(b,a).normalize();capsuleForward.copy(headForward).applyQuaternion(head.getWorldQuaternion(capsuleQ));
    capsuleForward.addScaledVector(capsuleUp,-capsuleForward.dot(capsuleUp)).normalize().multiplyScalar(NECK_CAPSULE.forward);
    const base=a.clone().add(capsuleForward);
    return {name:'MaskNeck',a:base.clone().addScaledVector(capsuleUp,-NECK_CAPSULE.below),b:base.clone().addScaledVector(capsuleUp,NECK_CAPSULE.above),r:NECK_CAPSULE.r,r1:NECK_CAPSULE.r};
  }
  function getVertexPosition(mesh,index,out=new THREE.Vector3()){
    mesh.updateWorldMatrix(true,false);mesh.userData.maskSkinning.update();
    const state=mesh.userData.maskSkinning,geo=mesh.geometry,ids=geo.attributes.skinIndex,w=geo.attributes.skinWeight;
    if(state.uniforms.maskDqAmount.value){
      const p=new THREE.Vector3().fromBufferAttribute(geo.attributes.position,index).applyMatrix4(mesh.bindMatrix);
      out.fromArray(transformBlendedPoint(state.r,state.d,[ids.getX(index),ids.getY(index),ids.getZ(index),ids.getW(index)],[w.getX(index),w.getY(index),w.getZ(index),w.getW(index)],p.toArray())).applyMatrix4(mesh.bindMatrixInverse);
    }else mesh.getVertexPosition(index,out);
    return out.applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInv.copy(root.matrixWorld).invert());
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
      const material=new THREE.MeshStandardMaterial({map,normalMap,normalScale:new THREE.Vector2(1,1),roughness:.95,metalness:0,side:THREE.FrontSide});   /* FrontSide: the shaping lays the cloth's inner and outer walls onto the same surface; DoubleSide z-fights them into grey blotches */
      for(const old of accessory.meshes||[]){group.remove(old);old.skeleton?.dispose();}
      shaped=[];accessory.meshes=[];
      gltf.scene.traverse(object=>{if(object.isMesh){
        const geometry=object.geometry,mesh=new THREE.SkinnedMesh(geometry,material);
        mesh.name='Mask_Fitted_Detail';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
        const record={mesh,original:geometry.attributes.position.array.slice(),normals:geometry.attributes.normal.array.slice()};shaped.push(record);
        geometry.setAttribute('maskRelief',new THREE.Float32BufferAttribute(sourceRelief(record),1));
        group.add(mesh);accessory.meshes.push(mesh);
      }});
      skinField();sourceFields();refit();
      accessory.status='ready';onReady();return accessory;
    })().catch(error=>{accessory.status='error';accessory.error=error;console.error('[Mask]',error);onReady();return accessory;});
    return accessory.ready;
  }
  load();return accessory;
}
