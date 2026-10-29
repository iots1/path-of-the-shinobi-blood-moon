// Shoulder-centred reverse-release approach. Spherical Bezier interpolation
// avoids the near-zero direction and sudden flip of a normalized linear blend.
const unit=a=>{const n=Math.hypot(...a);return n>1e-9?a.map(v=>v/n):[1,0,0];};
function slerp(a,b,t){
 const dot=Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0)));
 if(dot>.9995)return unit(a.map((v,i)=>v*(1-t)+b[i]*t));
 if(dot<-.9995){const seed=Math.abs(a[0])<.8?[1,0,0]:[0,0,1],p=unit(seed.map((v,i)=>v-a[i]*seed.reduce((s,x,j)=>s+x*a[j],0)));return a.map((v,i)=>v*Math.cos(Math.PI*t)+p[i]*Math.sin(Math.PI*t));}
 const theta=Math.acos(dot),sin=Math.sin(theta);return a.map((v,i)=>(v*Math.sin((1-t)*theta)+b[i]*Math.sin(t*theta))/sin);
}
export function radialReachArc(start,end,phase){
 const t=Math.max(0,Math.min(1,phase)),k=t*t*(3-2*t),a=Math.hypot(...start),b=Math.hypot(...end),u=unit(start),v=unit(end),outside=unit([1,-.12,.3]);
 const d=slerp(slerp(u,outside,k),slerp(outside,v,k),k),r=a+(b-a)*k;return d.map(x=>x*r);
}
