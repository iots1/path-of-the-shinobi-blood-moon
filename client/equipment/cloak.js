import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Full-resolution fitted source. Optimization is deferred until the fit is final.
// A separate skin drives broad cloth strips without per-vertex capsule lumps.
export function createCloak({THREE,root,real,SOD,loadTexture,onReady=()=>{}}){
  const group=new THREE.Group();group.name='equipment-cloak';root.add(group);
  const V=()=>new THREE.Vector3(),M=()=>new THREE.Matrix4(),Q=()=>new THREE.Quaternion();
  const rootInv=M(),chestDelta=M(),chestBindInv=M(),hipBind=V(),hipShift=V();
  const sway=new SOD(1.8,.9,0,0),lift=new SOD(1.6,.9,0,0),velocity=V();
  const controls=[];
  const target=V(),targetNext=V(),direction=V(),quaternion=Q(),matrix=M(),unit=V().setScalar(1),bindDown=V().set(0,-1,0);
  let clock=0,preparedAt=-Infinity;
  const wp=name=>real.bone[name].getWorldPosition(V()).applyMatrix4(rootInv);
  root.updateMatrixWorld(true);rootInv.copy(root.matrixWorld).invert();
  chestBindInv.multiplyMatrices(rootInv,real.bone.Spine.matrixWorld).invert();hipBind.copy(wp('Hips'));
  const accessory={group,status:'loading',error:null,ready:null,update,load,prepareRender};
  const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};

  function clothPoint(rest,out){
    const drop=THREE.MathUtils.clamp((1.39-rest.y)/.95,0,1),gravity=smooth(drop)*.82;
    out.copy(rest).applyMatrix4(chestDelta);
    out.lerp(direction.copy(rest).add(hipShift),gravity);
    out.x+=sway.y*drop*drop;
    out.z-=lift.y*drop*drop;
    out.z+=Math.sin(clock*.0025+rest.x*4-drop*2)*.003*drop*drop;
    out.y=Math.max(.18,out.y);
    return out;
  }
  function place(control,position,rotation){
    matrix.compose(position,rotation,unit).premultiply(root.matrixWorld);
    matrix.premultiply(rootInv.copy(control.bone.parent.matrixWorld).invert());
    matrix.decompose(control.bone.position,control.bone.quaternion,control.bone.scale);
    control.bone.updateMatrixWorld(true);
  }
  function prepareRender(){
    if(!group.visible || accessory.status!=='ready' || preparedAt===clock)return;
    preparedAt=clock;root.updateMatrixWorld(true);
    for(const control of controls){
      if(control.kind==='collar' || control.kind==='shoulder'){
        const delta=chestDelta;
        target.copy(control.rest).applyMatrix4(delta);
        quaternion.setFromRotationMatrix(delta).multiply(control.rotation);
        place(control,target,quaternion);
      }else{
        clothPoint(control.rest,target);clothPoint(control.next,targetNext);
        quaternion.setFromUnitVectors(bindDown,direction.copy(targetNext).sub(target).normalize()).multiply(control.rotation);
        place(control,target,quaternion);
      }
    }
    for(const mesh of accessory.meshes||[])mesh.skeleton.update();
  }
  function update(dt,state,spin=0){
    if(!group.visible || accessory.status!=='ready')return;
    root.updateMatrixWorld(true);rootInv.copy(root.matrixWorld).invert();
    chestDelta.multiplyMatrices(rootInv,real.bone.Spine.matrixWorld).multiply(chestBindInv);
    hipShift.copy(wp('Hips')).sub(hipBind);clock=state.clock;
    if(dt>0){
      velocity.copy(state.vel).applyQuaternion(root.getWorldQuaternion(quaternion).invert());
      sway.update(dt,THREE.MathUtils.clamp(-velocity.x*.018-spin*.010,-.085,.085));
      lift.update(dt,THREE.MathUtils.clamp(Math.max(0,velocity.z)*.055+Math.abs(spin)*.008,0,.25));
    }

  }
  function load(){
    accessory.status='loading';accessory.error=null;
    accessory.ready=(async()=>{
      const response=await fetch('/assets/cloak-fitted.glb',{cache:'no-cache'});
      if(!response.ok)throw new Error('Cloak HTTP '+response.status);
      const buffer=await response.arrayBuffer(),gltf=await new GLTFLoader().parseAsync(buffer,'');
      const json=gltf.parser.json,source=json.materials[0],pbr=source.pbrMetallicRoughness;
      const decode=index=>index==null?null:loadTexture(buffer,json.textures[index].source);
      const [map,normalMap]=await Promise.all([decode(pbr.baseColorTexture?.index),decode(source.normalTexture?.index)]);
      if(map)map.anisotropy=8;
      const material=new THREE.MeshStandardMaterial({map,normalMap,normalScale:new THREE.Vector2(.55,.55),roughness:.95,metalness:0,side:THREE.DoubleSide});
      gltf.scene.updateMatrixWorld(true);accessory.meshes=[];
      gltf.scene.traverse(object=>{
        if(object.isSkinnedMesh){
          object.material=material;object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;
          accessory.meshes.push(object);
        }
        if(!object.isBone)return;
        const rest=object.getWorldPosition(V()),rotation=object.getWorldQuaternion(Q());
        const parts=/^Cloak_(\d)_(\d)$/.exec(object.name);
        const kind=parts?'strip':object.name==='Cloak_Collar'?'collar':'shoulder';
        controls.push({bone:object,rest,rotation,kind,side:object.name.endsWith('L')?'L':'R',row:parts?+parts[2]:0,next:rest.clone().add(V().set(0,-.22,0))});
      });
      if(!accessory.meshes.length || controls.length!==28)throw new Error('Expected a full-resolution cloak with 28 cloth bones');
      // Traverse gives parent-before-child order, as required by place().
      group.add(gltf.scene);group.userData.source='/assets/cloak-fitted.glb';
      accessory.status='ready';onReady();return accessory;
    })().catch(error=>{accessory.status='error';accessory.error=error;console.error('[Cloak]',error);onReady();return accessory;});
    return accessory.ready;
  }
  load();return accessory;
}
