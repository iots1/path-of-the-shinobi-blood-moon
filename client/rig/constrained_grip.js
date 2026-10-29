import * as THREE from 'three';
import {upperControlAngles,foreControlAngles} from './hinge_frame.js';
const rad=Math.PI/180,clamp=THREE.MathUtils.clamp;
function linear(A,b){const n=b.length;A=A.map((r,i)=>[...r,b[i]]);for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[p][k]))p=i;[A[k],A[p]]=[A[p],A[k]];if(Math.abs(A[k][k])<1e-12)return b.map(()=>0);const d=A[k][k];for(let j=k;j<=n;j++)A[k][j]/=d;for(let i=0;i<n;i++)if(i!==k){const f=A[i][k];for(let j=k;j<=n;j++)A[i][j]-=f*A[k][j];}}return A.map(r=>r[n]);}
// Solve palm position and blade axis together inside the anatomical joint box.
// The previous solution bounds each physical degree of freedom, preventing an
// IK elbow-circle branch change from becoming a one-frame shoulder flip.
export function solveConstrainedGrip(a,side,target,blade,grip,chestQ,dt,reach=null){
 if(reach&&!reach.fit)reach={...reach,target:reach.target||target,blade:reach.blade||blade};
 const parent=a.up.parent.getWorldQuaternion(new THREE.Quaternion()),sh=a.up.getWorldPosition(new THREE.Vector3()),rest=a.controlRestInverse.clone().invert(),adapt=a.controlAdapterInverse.clone().invert(),kinv=grip.K.clone().invert();
 const clavicle=a.up.parent,clavicleParent=clavicle.parent.getWorldQuaternion(new THREE.Quaternion()),clavicleBase=clavicle.quaternion.clone(),claviclePosition=clavicle.getWorldPosition(new THREE.Vector3());
 const upper=upperControlAngles(a),fore=foreControlAngles(a),hand=a.q0.clone().invert().multiply(a.ha.quaternion),he=new THREE.Euler().setFromQuaternion(hand,'XZY');
 let x=a.gripSolution?.slice()||[upper.flexion,upper.abduction,upper.roll,(a.frameFlexStart??fore.flexion*rad)/rad,fore.roll,he.x/rad,he.z/rad,he.y/rad,...(a.clavicleControl||[0,0])];
 while(x.length<11)x.push(0);
 // Replan after the thrust torso has risen; defer hand orientation until then.
 if(reach&&!reach.fit&&(!a.gripReach||a.gripReach.stage!==reach.stage||(reach.stage==='draw'&&reach.phase>=.24&&!a.gripReach.refit))){
   const live=x.slice(),start=reach.stage==='draw'&&a.gripReach?.stage==='draw'?a.gripReach.start.slice():live.slice();let best=null;
   const parentPose=a.up.parent.quaternion.clone();if(reach.parentRest){a.up.parent.quaternion.copy(reach.parentRest);a.up.parent.updateMatrixWorld(true);}
   const fittingParent=a.up.parent.quaternion.clone();
   for(const seed of [[90,-45,-50,25,-72,-13,48,-24,0,0,0],...(a.gripReach?.goal?[a.gripReach.goal]:[]),[40,40,-90,105,-13,10,42,-16,-25,8,-20],[0,5,-70,12,0,0,0,0],[0,70,-40,60,0,0,0,0],[-30,80,30,60,-30,0,0,0],[75,15,-90,118,15,25,85,20],[10,20,-70,110,-30,0,0,0],[100,70,-60,110,0,0,0,0],[-80,60,-60,100,0,0,0,0]]){
     a.up.parent.quaternion.copy(fittingParent);a.up.parent.updateMatrixWorld(true);
     a.gripSolution=seed.length>=11?seed.slice():[...seed,0,0,0];const fit=solveConstrainedGrip(a,side,reach.endpoint||reach.target,reach.blade,grip,chestQ,1,{fit:true,stage:reach.stage,pose:reach.stage,limits:reach.limits,origin:start,duration:reach.duration});if(!best||fit.cost<best.cost)best=fit;
   }
   a.up.parent.quaternion.copy(parentPose);a.up.parent.updateMatrixWorld(true);
   a.gripReach={stage:reach.stage,start,goal:best.angles,refit:reach.stage==='draw'&&reach.phase>=.24,fit:{gap:best.palmGap,angle:best.bladeAngle}};a.gripSolution=live;x=live.slice();
 }

 const prior=x.slice();
 const planned=reach&&!reach.fit&&reach.stage!=='extract'&&reach.phase<1;
 if(planned){
   const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
   if(reach.stage==='draw'){
     const prep=smooth(reach.phase/.44),handPrep=smooth((reach.phase-.24)/.20),lift=smooth((reach.phase-.44)/.56);
     x=a.gripReach.start.map((n,i)=>{
       if(i>=3&&i<8)return n+(a.gripReach.goal[i]-n)*(i===3?prep:handPrep);
       if(i>=8)return n+(a.gripReach.goal[i]-n)*lift;
       const prepared=i===1?Math.max(n,-22):i===2?n+(a.gripReach.goal[i]-n)*.35:n;
       return n+(prepared-n)*prep+(a.gripReach.goal[i]-prepared)*lift;
     });
   }else{const t=reach.phase,edge=.05,k=t<edge?t*t/(2*edge*(1-edge)):t>1-edge?1-(1-t)*(1-t)/(2*edge*(1-edge)):(t-edge/2)/(1-edge);x=a.gripReach.start.map((n,i)=>n+(a.gripReach.goal[i]-n)*k);}
 }

 // Last controls are clavicle X/Z/Y. Include protraction so the elbow can
 // stay outboard without using an extreme wrist pose to reach the same hilt.
 const previous=prior,lo=[-120,-100,-90,-5,-85,-100,-100,-25,-20,-20,-20],hi=[145,100,90,133,85,100,100,25,20,20,20],rate=[600,600,450,650,600,600,600,600,90,90,90];
 const clavicleTwistLimit=15*rad,clavicleAngleLimit=12*rad,attachmentToChest=chestQ.clone().invert().multiply(parent);
 const clavicleDelta=new THREE.Quaternion(),identity=new THREE.Quaternion(),clavicleEuler=new THREE.Euler(),attachmentAxis=a.up.position.clone().normalize(),clavicleTwist=new THREE.Quaternion(),clavicleSwing=new THREE.Quaternion();
 const lifting=reach?.stage==='draw'&&reach.holdShape&&reach.phase>=.44;
 const bounded=v=>{const result=v.map((n,i)=>{if(reach?.relaxClavicle&&i>=8)n=0;
 let lower=lo[i],upper=hi[i];
 if(reach?.fit&&reach.origin&&['extract','spread','cut'].includes(reach.pose)){
   let travel=rate[i]*reach.duration*.93;
   if(reach.pose==='cut'&&i===3)travel=Math.min(travel,5);
   if(reach.pose==='cut'&&i===4)travel=Math.min(travel,40);
   if(reach.pose==='cut'&&i>=5&&i<8)travel=Math.min(travel,15);
   lower=Math.max(lower,reach.origin[i]-travel);upper=Math.min(upper,reach.origin[i]+travel);
 }
 return clamp(n,Math.max(lower,previous[i]-(lifting&&i>=3&&i<8?240:rate[i])*dt),Math.min(upper,previous[i]+(lifting&&i>=3&&i<8?240:rate[i])*dt));});
 // Bound the joint's actual displacement, rather than permitting a large
 // clavicle offset to drag the sleeve root away from the torso.
 clavicleDelta.setFromEuler(new THREE.Euler(result[8]*rad,result[10]*rad,result[9]*rad,'XYZ'));
 const along=clavicleDelta.x*attachmentAxis.x+clavicleDelta.y*attachmentAxis.y+clavicleDelta.z*attachmentAxis.z;
 clavicleTwist.set(attachmentAxis.x*along,attachmentAxis.y*along,attachmentAxis.z*along,clavicleDelta.w).normalize();
 clavicleSwing.copy(clavicleDelta).multiply(clavicleTwist.clone().invert());
 const angle=identity.angleTo(clavicleSwing);if(angle>clavicleAngleLimit)clavicleSwing.slerp(identity,1-clavicleAngleLimit/angle);
 // Scapular elevation is allowed during an overhead reach; depression and
 // sideways travel stay small so the upper arm cannot pull out of the sleeve.
 const attachmentError=q=>{const d=a.up.position.clone().applyQuaternion(q).sub(a.up.position).applyQuaternion(attachmentToChest);return Math.hypot(d.x/.012,d.y/(d.y>=0?.035:.012),d.z/.012);};
 if(attachmentError(clavicleSwing)>1){const wanted=clavicleSwing.clone();let low=0,high=1;for(let i=0;i<12;i++){const mid=(low+high)/2;clavicleSwing.copy(identity).slerp(wanted,mid);if(attachmentError(clavicleSwing)>1)high=mid;else low=mid;}clavicleSwing.copy(identity).slerp(wanted,low);}
 const twistAngle=identity.angleTo(clavicleTwist);if(twistAngle>clavicleTwistLimit)clavicleTwist.slerp(identity,1-clavicleTwistLimit/twistAngle);
 clavicleDelta.copy(clavicleSwing).multiply(clavicleTwist);clavicleEuler.setFromQuaternion(clavicleDelta,'XYZ');result[8]=clavicleEuler.x/rad;result[9]=clavicleEuler.z/rad;result[10]=clavicleEuler.y/rad;
 return result;};
 const fk=v=>{const clavicleQ=clavicleBase.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v[8]*rad,v[10]*rad,v[9]*rad,'XYZ'))).normalize(),parentQ=clavicleParent.clone().multiply(clavicleQ).normalize(),shoulder=a.up.position.clone().applyQuaternion(parentQ).add(claviclePosition);const u=parentQ.clone().multiply(rest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0]*rad,v[2]*rad,v[1]*rad,'XZY'))).multiply(adapt),f=u.clone().multiply(a.hingeFrame).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v[3]*rad,v[4]*rad,0,'XYZ'))).multiply(a.foreAdapter),h=f.clone().multiply(a.q0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(v[5],0,v[6]).normalize(),Math.hypot(v[5],v[6])*rad).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),v[7]*rad))),el=a.fo.position.clone().applyQuaternion(u).add(shoulder),wr=a.ha.position.clone().applyQuaternion(f).add(el),p=grip.pt.clone().applyQuaternion(h).add(wr),axis=new THREE.Vector3(0,1,0).applyQuaternion(h.clone().multiply(kinv));return {u,f,h,el,wr,p,axis,parentQ,clavicleQ,shoulder};};
 // A valid joint-box endpoint can still be a poor reach (e.g. 64° wrist
 // extension). Choose a modest wrist and an outside elbow before lifting.
 const comfortableDraw=side==='L'&&reach?.fit&&reach.pose==='draw';
 const limits=comfortableDraw?{flex:50,ext:50,radial:20,ulnar:25}:reach?.limits||{flex:80,ext:70,radial:25,ulnar:40};

 const residual=v=>{const k=fk(v),p=k.p.sub(target),d=k.axis.clone().sub(blade),fh=k.wr.clone().sub(k.el).normalize().applyQuaternion(k.h.clone().invert()),bend=Math.acos(clamp(fh.y,-1,1))/rad,phi=Math.atan2(-fh.z,-(side==='R'?-1:1)*fh.x),fl=bend*Math.cos(phi),rd=bend*Math.sin(phi),ellipse=Math.hypot(fl/(fl>=0?limits.flex:limits.ext),rd/(rd>=0?limits.radial:limits.ulnar)),elLocal=k.el.clone().sub(k.shoulder).applyQuaternion(chestQ.clone().invert()),up=elLocal.clone().normalize();return [p.x*(comfortableDraw?200:reach?.stage==='extract'?120:dt>=1?45:reach?.stage==='draw'?120:30),p.y*(comfortableDraw?200:reach?.stage==='extract'?120:dt>=1?45:reach?.stage==='draw'?120:30),p.z*(comfortableDraw?200:reach?.stage==='extract'?120:dt>=1?45:reach?.stage==='draw'?120:30),d.x*(comfortableDraw ? 0.5 : reach?.stage==='extract'||reach?.stage==='draw'?10:dt>=1?6:2),d.y*(comfortableDraw ? 0.5 : reach?.stage==='extract'||reach?.stage==='draw'?10:dt>=1?6:2),d.z*(comfortableDraw ? 0.5 : reach?.stage==='extract'||reach?.stage==='draw'?10:dt>=1?6:2),Math.max(0,ellipse-.98)*(comfortableDraw||reach?.stage==='extract'||reach?.stage==='draw'?200:dt>=1?20:5),Math.max(0,-up.z-Math.sin(68*rad))*10,...(side==='L'&&((dt>=1&&['draw','return'].includes(reach?.pose))||reach?.stage==='extract')?[Math.max(0,.04-elLocal.x)*20,Math.max(0,elLocal.z-.22)*10]:[]),...(dt>=1&&['spread','cut'].includes(reach?.pose)?[(v[3]-(reach.pose==='spread'?-4:0))*.5]:[]),...(reach?.stage==='draw'?[Math.max(0,.10-elLocal.x)*120]:[]),...(reach?.stage==='extract'?[Math.max(0,Math.acos(clamp(k.axis.dot(blade),-1,1))/rad-23)*2]:[]),...(comfortableDraw?[Math.max(0,Math.acos(clamp(k.axis.dot(blade),-1,1))/rad-20)*.5,Math.max(0,.12-elLocal.x)*40,Math.max(0,elLocal.z-.15)*20,Math.max(0,60-k.shoulder.clone().sub(k.el).angleTo(k.wr.clone().sub(k.el))/rad)*.08,fl*.02,rd*.04,(v[2]-(reach.origin?.[2]||0))*.001,...v.slice(8).map(n=>n*.04)]:[]),...v.map((n,i)=>(n-previous[i])*.0002)];};
 const refining=planned&&reach.stage==='draw'&&reach.phase>.72;if(refining)x=prior.slice();
 if(reach?.stage==='extract'&&!reach.fit&&a.gripReach?.goal)x=prior.map((n,i)=>n+(a.gripReach.goal[i]-n)*Math.min(1,dt/Math.max(dt,reach.duration*(1-reach.phase))));
 const norm=r=>r.reduce((s,v)=>s+v*v,0);x=bounded(x);let value=norm(residual(x));
 for(let it=0;it<(planned&&!refining?0:dt>=1?60:4);it++){const r=residual(x),J=x.map((_,j)=>{const v=x.slice();v[j]+=.05;const rr=residual(v);return rr.map((n,i)=>(n-r[i])/.05);}),A=J.map((a,i)=>J.map((b,j)=>a.reduce((s,n,k)=>s+n*b[k],0)+(i===j?.00001:0))),b=J.map(a=>-a.reduce((s,n,k)=>s+n*r[k],0)),step=linear(A,b),stepScale=Math.min(1,12/Math.max(...step.map(Math.abs)));let improved=false;for(const scale of [1,.5,.2,.05,.01]){const v=bounded(x.map((n,i)=>n+step[i]*stepScale*scale)),cost=norm(residual(v));if(cost<value){x=v;value=cost;improved=true;break;}}if(!improved)break;}
 for(const h of (planned&&!refining?[]:dt>=1?[15,5,1,.2]:[1,.2]))for(let sweep=0;sweep<(dt>=1?30:1);sweep++){let improved=false;for(let j=0;j<x.length;j++)for(const sign of [-1,1]){const v=x.slice();v[j]+=sign*h;const z=bounded(v),cost=norm(residual(z));if(cost<value){x=z;value=cost;improved=true;}}if(!improved)break;}
 a.gripSolution=x;const k=fk(x);a.gripEvaluation={gap:k.p.distanceTo(target),angle:k.axis.angleTo(blade)/rad};a.shoulderAttachment={displacementM:k.shoulder.distanceTo(sh),chestOffset:k.shoulder.clone().sub(sh).applyQuaternion(chestQ.clone().invert()).toArray(),rotationDegrees:clavicleBase.angleTo(k.clavicleQ)/rad,base:sh.toArray(),baseQuaternion:clavicleBase.toArray(),joint:k.shoulder.toArray()};clavicle.quaternion.copy(k.clavicleQ);clavicle.updateMatrixWorld(true);a.up.quaternion.copy(k.parentQ).invert().multiply(k.u).normalize();a.up.updateMatrixWorld(true);a.fo.quaternion.copy(k.u).invert().multiply(k.f).normalize();a.fo.updateMatrixWorld(true);a.ha.quaternion.copy(k.f).invert().multiply(k.h).normalize();a.ha.updateMatrixWorld(true);a.anatomicalControl={flexion:x[0],abduction:x[1],roll:x[2]};a.upperRoll=x[2]*rad;a.rollS=x[4]*rad;a.hingeFlexState=x[3]*rad;a.clavicleControl=x.slice(8);a.clavicleAngles={x:x[8],y:x[10],z:x[9]};return {cost:value,angles:x,palmGap:k.p.distanceTo(target),bladeAngle:k.axis.angleTo(blade)/rad};
}
