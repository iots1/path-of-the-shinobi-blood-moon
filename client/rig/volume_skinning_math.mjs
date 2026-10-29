export function encodeRigidTransform(p,q,real,dual,o=0){
  real.set([q.x,q.y,q.z,q.w],o);
  dual[o]=.5*(p.x*q.w+p.y*q.z-p.z*q.y);
  dual[o+1]=.5*(-p.x*q.z+p.y*q.w+p.z*q.x);
  dual[o+2]=.5*(p.x*q.y-p.y*q.x+p.z*q.w);
  dual[o+3]=-.5*(p.x*q.x+p.y*q.y+p.z*q.z);
}
export function transformBlendedPoint(real,dual,indices,weights,p){
  const r=[0,0,0,0],d=[0,0,0,0];
  let strongest=0;for(let k=1;k<4;k++)if(weights[k]>weights[strongest])strongest=k;
  const ref=indices[strongest]*4;
  for(let k=0;k<4;k++){
    const o=indices[k]*4;let dot=0;for(let c=0;c<4;c++)dot+=real[ref+c]*real[o+c];
    const w=weights[k]*(dot<0?-1:1);
    for(let c=0;c<4;c++){r[c]+=real[o+c]*w;d[c]+=dual[o+c]*w;}
  }
  const n=Math.hypot(...r);for(let c=0;c<4;c++){r[c]/=n;d[c]/=n;}
  const rd=r.reduce((s,v,i)=>s+v*d[i],0);for(let c=0;c<4;c++)d[c]-=r[c]*rd;
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const a=cross(r,p),b=cross(r,a.map((v,i)=>v+r[3]*p[i]));
  const t=cross(r,d);
  return p.map((v,i)=>v+2*b[i]+2*(r[3]*d[i]-d[3]*r[i]+t[i]));
}
