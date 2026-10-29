// Tibia points ankle -> knee, expressed in the anatomical shoe frame.
export function anklePitchCorrection([,y,z],dorsiflexion=20,plantarflexion=50){
 const angle=Math.atan2(z,y),r=Math.PI/180;
 return angle-Math.max(-plantarflexion*r,Math.min(dorsiflexion*r,angle));
}
