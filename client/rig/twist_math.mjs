// q = swing * twist; axis is the segment direction in its original bone frame.
// Quaternion signs are interchangeable. Unwrap the angle to keep partial twist
// continuous through +/-pi, including when the input quaternion changes sign.
export function twistAngle(q,axis,previous=0){
  const projection=q[0]*axis[0]+q[1]*axis[1]+q[2]*axis[2];
  if(Math.hypot(projection,q[3])<1e-8)return previous;
  const angle=2*Math.atan2(projection,q[3]);
  return previous+Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
}

// Skin twist is a bounded anatomical coordinate, not a wheel angle. Keep the
// same stop while an out-of-range quaternion crosses +/-pi; re-enter through
// the permitted interval once the source returns into it.
export function boundedTwistTarget(q,axis,previous,limit){
  const raw=twistAngle(q,axis,0);
  if(Math.abs(raw)>limit&&Math.abs(previous)>limit*.5&&Math.sign(raw)!==Math.sign(previous))return Math.sign(previous)*limit;
  return Math.max(-limit,Math.min(limit,raw));
}
export function stepSkinTwist(angle,target,dt,limit,rate=450*Math.PI/180){
  if(!(dt>0))return angle;
  const step=(target-angle)*(1-Math.exp(-dt/.06)),max=rate*dt;
  return Math.max(-limit,Math.min(limit,angle+Math.max(-max,Math.min(max,step))));
}
