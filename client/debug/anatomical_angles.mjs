// All vectors are expressed in an anatomical segment frame, not bone XYZ.
const D=180/Math.PI,clamp=x=>Math.max(-1,Math.min(1,x));
export function shoulderDirection([x,y,z],side){
  const length=Math.hypot(x,y,z);x/=length;y/=length;z/=length;
  const elevation=Math.acos(clamp(-y))*D;
  // A plane of elevation is undefined when the arm is exactly down/up.
  const planeDefined=Math.hypot(x,z)>1e-5;
  return {elevation,plane:planeDefined?Math.atan2(z,side*x)*D:null,
    extension:Math.asin(clamp(Math.max(0,-z)))*D,
    crossBody:Math.asin(clamp(Math.max(0,-side*x)))*D};
}
export function hingeDirection([x,y,z],bendSign=1){
  // Project into the calibrated hinge plane; keep off-plane error separate.
  return {flexion:Math.atan2(bendSign*z,y)*D,
    offPlane:Math.atan2(x,Math.hypot(y,z))*D};
}
export function rangeExcess(value,[min,max]){return Number.isFinite(value)?Math.max(0,min-value,value-max):Infinity;}
