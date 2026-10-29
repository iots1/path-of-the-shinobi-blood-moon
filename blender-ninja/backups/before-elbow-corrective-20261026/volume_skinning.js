import * as THREE from 'three';
import {encodeRigidTransform,transformBlendedPoint} from './volume_skinning_math.mjs';

// Unit dual quaternions blend rigid joint transforms without shrinking the
// cross-section when two bones twist in opposite directions. The uniform toggle
// retains Three.js's original skinning for exact same-pose A/B inspection.
export function enableVolumeSkinning(mesh, outline, beforeSkeletonUpdate=()=>{}) {
  const skeleton=mesh.skeleton, count=skeleton.bones.length;
  // Full DQ at a bent hinge can puff loose cloth into a ball. Retain DQ on
  // twisting segments/hands, blending toward linear skin only at the joints.
  const jointVolume=new Float32Array(mesh.geometry.attributes.position.count).fill(1);
  const bindPoint=new THREE.Vector3(),vertex=new THREE.Vector3(),restMatrix=new THREE.Matrix4();
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  for(let b=0;b<count;b++){
    const name=skeleton.bones[b].name.replace(/^mixamorig:?/,'');
    if(!/^(Left|Right)(Arm|ForeArm)$/.test(name))continue;
    const elbow=name.endsWith('ForeArm'),core=elbow ? .045 : .075,radius=elbow ? .10 : .16,target=elbow ? .35 : .18;
    bindPoint.setFromMatrixPosition(restMatrix.copy(skeleton.boneInverses[b]).invert());
    for(let i=0;i<jointVolume.length;i++){
      vertex.fromBufferAttribute(mesh.geometry.attributes.position,i);
      const weight=1-smooth((vertex.distanceTo(bindPoint)-core)/(radius-core));
      jointVolume[i]=Math.min(jointVolume[i],1-weight*(1-target));
    }
  }
  mesh.geometry.setAttribute('jointVolume',new THREE.BufferAttribute(jointVolume,1));
  const real=new Float32Array(count*4), dual=new Float32Array(count*4);
  const uniforms={dqReal:{value:real},dqDual:{value:dual},dqAmount:{value:1}};
  const matrix=new THREE.Matrix4(), p=new THREE.Vector3(), q=new THREE.Quaternion(), scale=new THREE.Vector3();
  const state={enabled:true,unsupportedScale:false,real,dual,update(){
    // Finger poses are written after arm IK. Refresh the whole hierarchy before
    // encoding DQ uniforms; renderer.render updates it too late for these uniforms.
    for(const bone of skeleton.bones)if(!bone.parent?.isBone)bone.updateWorldMatrix(true,true);
    mesh.updateWorldMatrix(true,false);
    beforeSkeletonUpdate();
    skeleton.update();
    let rigid=true;
    for(let i=0;i<count;i++){
      matrix.fromArray(skeleton.boneMatrices,i*16).decompose(p,q,scale);q.normalize();
      if(Math.max(Math.abs(scale.x-1),Math.abs(scale.y-1),Math.abs(scale.z-1))>.002) rigid=false;
      encodeRigidTransform(p,q,real,dual,i*4);
    }
    state.unsupportedScale=!rigid;
    uniforms.dqAmount.value=state.enabled&&rigid?1:0;
  }};
  const declarations=`
#ifdef USE_SKINNING
uniform vec4 dqReal[${count}];
uniform vec4 dqDual[${count}];
uniform float dqAmount;
attribute float jointVolume;
vec4 dqMultiply(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec3 dqRotate(vec4 r,vec3 v){return v+2.0*cross(r.xyz,cross(r.xyz,v)+r.w*v);}
void dqBlend(out vec4 r,out vec4 d){
  ivec4 idx=ivec4(skinIndex);
  int referenceIndex=idx.x;float referenceWeight=skinWeight.x;
  if(skinWeight.y>referenceWeight){referenceIndex=idx.y;referenceWeight=skinWeight.y;}
  if(skinWeight.z>referenceWeight){referenceIndex=idx.z;referenceWeight=skinWeight.z;}
  if(skinWeight.w>referenceWeight){referenceIndex=idx.w;}
  vec4 reference=dqReal[referenceIndex];
  vec4 signs=vec4(1.0,dot(reference,dqReal[idx.y])<0.0?-1.0:1.0,dot(reference,dqReal[idx.z])<0.0?-1.0:1.0,dot(reference,dqReal[idx.w])<0.0?-1.0:1.0);
  vec4 w=skinWeight*signs;
  r=dqReal[idx.x]*w.x+dqReal[idx.y]*w.y+dqReal[idx.z]*w.z+dqReal[idx.w]*w.w;
  d=dqDual[idx.x]*w.x+dqDual[idx.y]*w.y+dqDual[idx.z]*w.z+dqDual[idx.w]*w.w;
  float len=max(length(r),0.00001);r/=len;d/=len;d-=r*dot(r,d);
}
#endif
`;
  const position=`
#ifdef USE_SKINNING
vec4 skinVertex=bindMatrix*vec4(transformed,1.0);
vec4 linearSkinned=boneMatX*skinVertex*skinWeight.x+boneMatY*skinVertex*skinWeight.y+boneMatZ*skinVertex*skinWeight.z+boneMatW*skinVertex*skinWeight.w;
vec4 dqR,dqD;dqBlend(dqR,dqD);
vec3 dqTranslation=2.0*dqMultiply(dqD,vec4(-dqR.xyz,dqR.w)).xyz;
vec3 volumeSkinned=dqRotate(dqR,skinVertex.xyz)+dqTranslation;
transformed=(bindMatrixInverse*vec4(mix(linearSkinned.xyz,volumeSkinned,dqAmount*jointVolume),1.0)).xyz;
#endif
`;
  const normal=`
#ifdef USE_SKINNING
mat4 skinMatrix=skinWeight.x*boneMatX+skinWeight.y*boneMatY+skinWeight.z*boneMatZ+skinWeight.w*boneMatW;
vec4 normalR,normalD;dqBlend(normalR,normalD);
vec3 bindNormal=(bindMatrix*vec4(objectNormal,0.0)).xyz;
objectNormal=(bindMatrixInverse*vec4(mix((skinMatrix*vec4(bindNormal,0.0)).xyz,dqRotate(normalR,bindNormal),dqAmount*jointVolume),0.0)).xyz;
#ifdef USE_TANGENT
vec3 bindTangent=(bindMatrix*vec4(objectTangent,0.0)).xyz;
objectTangent=(bindMatrixInverse*vec4(mix((skinMatrix*vec4(bindTangent,0.0)).xyz,dqRotate(normalR,bindTangent),dqAmount*jointVolume),0.0)).xyz;
#endif
#endif
`;
  // The 8 mm body outline overwhelmed finger thickness and hid grip contact.
  const gi=mesh.geometry.attributes.skinIndex,gw=mesh.geometry.attributes.skinWeight;
  const outlineScale=new Float32Array(gi.count);
  for(let i=0;i<gi.count;i++){
    let hand=0,head=0;for(let k=0;k<4;k++){const n=skeleton.bones[gi.array[i*4+k]].name,w=gw.array[i*4+k];if(n.includes('Hand'))hand+=w;else if(n.includes('Head')||n.includes('headfront'))head+=w;}
    outlineScale[i]=Math.max(.18,1-.82*hand-.5*head);
  }
  mesh.geometry.setAttribute('anatomyOutlineScale',new THREE.BufferAttribute(outlineScale,1));
  const outlineCompile=outline.material.onBeforeCompile;
  outline.material.onBeforeCompile=(shader,renderer)=>{outlineCompile.call(outline.material,shader,renderer);shader.vertexShader='attribute float anatomyOutlineScale;\n'+shader.vertexShader.replace('normal * 0.0080','normal * (0.0080 * anatomyOutlineScale)');};
  mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  mesh.customDistanceMaterial=new THREE.MeshDistanceMaterial();
  for(const material of [mesh.material,outline.material,mesh.customDepthMaterial,mesh.customDistanceMaterial]){
    const previous=material.onBeforeCompile, cache=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <skinning_pars_vertex>','#include <skinning_pars_vertex>\n'+declarations)
        .replace('#include <skinning_vertex>',position).replace('#include <skinnormal_vertex>',normal);
    };
    const key=cache();material.customProgramCacheKey=()=>key+'-dq-joint-volume-v2-'+count;material.needsUpdate=true;
  }
  const fixedAttributes={skinIndex:mesh.geometry.getAttribute('skinIndex'),skinWeight:mesh.geometry.getAttribute('skinWeight')};
  let originalAttributes=null;
  state.loadOriginalWeights=async url=>{
    const buffer=await (await fetch(url)).arrayBuffer(),dv=new DataView(buffer);
    const jsonSize=dv.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonSize)));
    const bin=20+jsonSize+8,attrs=json.meshes[0].primitives[0].attributes;
    const read=(name,n,Ctor)=>{
      const a=json.accessors[attrs[name]],v=json.bufferViews[a.bufferView];
      const out=new Ctor(a.count*n),size={5121:1,5123:2,5126:4}[a.componentType];
      const base=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;
      for(let i=0;i<a.count;i++)for(let c=0;c<n;c++){
        const off=base+i*stride+c*size;
        out[i*n+c]=a.componentType===5126?dv.getFloat32(off,true):a.componentType===5123?dv.getUint16(off,true):dv.getUint8(off);
      }
      return new THREE.BufferAttribute(out,n);
    };
    originalAttributes={skinIndex:read('JOINTS_0',4,Uint16Array),skinWeight:read('WEIGHTS_0',4,Float32Array)};
    if(originalAttributes.skinWeight.count!==fixedAttributes.skinWeight.count)throw new Error('Weight comparison requires identical vertex order/count');
  };
  state.useOriginalWeights=original=>{
    const attrs=original?originalAttributes:fixedAttributes;if(!attrs)return;
    for(const name of ['skinIndex','skinWeight'])mesh.geometry.setAttribute(name,attrs[name]);
  };
  state.getVertexPosition=(index,out=new THREE.Vector3())=>{
    const geo=mesh.geometry,ids=geo.attributes.skinIndex,w=geo.attributes.skinWeight;
    const point=new THREE.Vector3().fromBufferAttribute(geo.attributes.position,index).applyMatrix4(mesh.bindMatrix);
    const result=transformBlendedPoint(real,dual,[ids.getX(index),ids.getY(index),ids.getZ(index),ids.getW(index)],
      [w.getX(index),w.getY(index),w.getZ(index),w.getW(index)],point.toArray());
    const amount=uniforms.dqAmount.value*jointVolume[index];
    out.fromArray(result).applyMatrix4(mesh.bindMatrixInverse);
    if(amount<1)out.lerp(mesh.getVertexPosition(index,new THREE.Vector3()),1-amount);
    return out;
  };
  state.update();return state;
}
