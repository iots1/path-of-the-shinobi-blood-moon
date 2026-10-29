export function returnReach(l1,l2,weight){
 const w=Math.max(0,Math.min(1,weight)),straight=l1+l2-.005;
 const soft=Math.sqrt(l1*l1+l2*l2-2*l1*l2*Math.cos(135*Math.PI/180));
 return straight+(soft-straight)*4*w*(1-w);
}
export function neutralPole(elbow,wrist){
 const d=Math.hypot(...wrist),axis=wrist.map(x=>x/d),along=elbow.reduce((s,x,i)=>s+x*axis[i],0),pole=elbow.map((x,i)=>x-along*axis[i]),n=Math.hypot(...pole);
 if(n<1e-8)throw new Error('Neutral elbow plane is undefined at full extension');
 return pole.map(x=>x/n);
}
