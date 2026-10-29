import {shoulderTrace} from './motion_check.js';
import {createAnatomicalMeasure} from './anatomical_measure.js';
import {rangeExcess} from './anatomical_angles.mjs';
import {romScenarios} from './rom_scenarios.js';
import * as THREE from 'three';

// Reference envelopes are diagnostic. They are deliberately NOT substituted
// for the existing grip/IK limits, and a flag never counts as a passing test.
export {referenceRanges} from './rom_ranges.js';
import {referenceRanges} from './rom_ranges.js';

export async function romAudit(){
  while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
  const I=window.__iso;await Promise.all([I.rig.real.equipmentCloak?.ready,I.rig.real.equipmentMask?.ready]);I.stop();
  const measurement=createAnatomicalMeasure(I),reports=[];
  const plans=romScenarios.map(({name,...options})=>[name,options]);
  for(const [name,plan] of plans){
    if(parent!==window)parent.postMessage({type:'motion-task-progress',message:`RoM ${reports.length+1} / ${plans.length}: ${name}`},location.origin);
    const r={name,steps:0,flaggedSteps:0,referenceFlags:{},ranges:{},nonFinite:0,undefinedAxialSamples:0,rate:{},sourceMotion:{},frames:[]},prev={},previousMotion={};
    await shoulderTrace({...plan,onSample(t,dt){
      const {values,nullable}=measurement.sample(),act=I.S.act;
      const where={t,action:act?.def===I.DUAL?'dual':act?.def===I.ATTACK2?'thrust':act?.def===I.ISSEN?'issen':act?'combo':I.S.walkAmt>.1?'locomotion':'idle',actionMs:act?.t??null};
      r.steps++;r.undefinedAxialSamples+=nullable.length;
      // Quaternion differences avoid Euler branch/gimbal spikes. These are
      // joint-relative angular rates/accelerations, not medical thresholds.
      for(const boneName of ['Hips','Spine','Head',...['Left','Right'].flatMap(s=>['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot'].map(j=>s+j))]){
        const q=I.rig.real.bone[boneName].quaternion.clone().normalize(),old=previousMotion[boneName];
        if(old){
          const dq=q.clone().multiply(old.q.clone().invert()).normalize();if(dq.w<0)dq.set(-dq.x,-dq.y,-dq.z,-dq.w);
          const length=Math.hypot(dq.x,dq.y,dq.z),omega=new THREE.Vector3(dq.x,dq.y,dq.z).multiplyScalar(length>1e-12?2*Math.atan2(length,dq.w)/length/(dt/1000):0);
          const speed=omega.length()*180/Math.PI,acceleration=old.omega?omega.clone().sub(old.omega).length()*180/Math.PI/(dt/1000):0,stats=r.sourceMotion[boneName]??={speed:0,acceleration:0};
          if(speed>stats.speed){stats.speed=speed;stats.speedAt=where;}if(acceleration>stats.acceleration){stats.acceleration=acceleration;stats.accelerationAt=where;}
          previousMotion[boneName]={q,omega};
        }else previousMotion[boneName]={q};
      }
      const flags=[];
      for(const [key,value] of Object.entries(values)){
        if(!Number.isFinite(value)){r.nonFinite++;continue;}
        const rr=r.ranges[key]??={min:value,max:value,minAt:where,maxAt:where};
        if(value<rr.min){rr.min=value;rr.minAt=where;}if(value>rr.max){rr.max=value;rr.maxAt=where;}
        const range=referenceRanges[key]||referenceRanges[key.slice(2)];
        if(range){const excess=rangeExcess(value,range);if(excess>.5){flags.push(key);const f=r.referenceFlags[key]??={samples:0,worstExcess:0};f.samples++;if(excess>f.worstExcess)Object.assign(f,{worstExcess:excess,value,range,at:where});}}
        if(prev[key]!==undefined){const speed=Math.abs(Math.atan2(Math.sin((value-prev[key])*Math.PI/180),Math.cos((value-prev[key])*Math.PI/180))*180/Math.PI)/(dt/1000);if(!r.rate[key]||speed>r.rate[key].degreesPerSecond)r.rate[key]={degreesPerSecond:speed,at:where};}
        prev[key]=value;
      }
      if(flags.length)r.flaggedSteps++;r.frames.push({...where,values,nullable,flags});
    }});
    reports.push(r);
    await new Promise(r=>setTimeout(r,0));
  }
  const report={revision:I.runtimeRevision,calibration:measurement.calibration,stepMs:4,referenceRanges,
    provenance:{ranges:'configured character reference envelopes; not an AAOS certification',rigAlignment:'elbow.offPlane is an authoring-hinge diagnostic, not a clinical RoM number',
      sources:['https://media.isbweb.org/images/documents/standards/isb_jcs_part_ii.pdf','https://archive.cdc.gov/www_cdc_gov/ncbddd/jointrom/index_1704899060.html']},
    toleranceDegrees:.5,scenarioCount:reports.length,steps:reports.reduce((n,r)=>n+r.steps,0),
    nonFinite:reports.reduce((n,r)=>n+r.nonFinite,0),
    referenceFlagSamples:reports.reduce((n,r)=>n+Object.values(r.referenceFlags).reduce((n,f)=>n+f.samples,0),0),
    reports,shaderErrors:I.shaderErrors};
  await fetch('/debug/save?name=rom-audit.json',{method:'POST',body:JSON.stringify(report)});
  // Keep the UI report concise; the full per-step data stays in the JSON file.
  const summary={...report,reports:reports.map(({frames,...r})=>r)};
  if(parent!==window)parent.postMessage({type:'motion-rom-report',report:summary},location.origin);
  return JSON.stringify(summary,null,2);
}
