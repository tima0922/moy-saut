import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WHEEL_X, WHEEL_Z } from './vehicle.js?v=032';

export async function loadTrackCar(id) {
  const {scene}=await new GLTFLoader().loadAsync('./assets/track/'+id+'.glb?v=032');
  return createTrackCar(scene,id);
}

export function createTrackCar(shell,id) {
  const root=new Group();
  shell.position.y=id==='sedan' ? .205 : 0;
  root.add(shell);

  const hubs=WHEEL_Z.map((z,i)=>{
    const hub=new Group();
    hub.position.set(WHEEL_X[i],.32,z);
    root.add(hub);
    return hub;
  });
  const wheels=hubs.map(hub=>{
    const wheel=new Group();
    hub.add(wheel);
    return wheel;
  });
  const parts=[];
  const paints=new Set();
  let brakeLamps;
  shell.traverse(object=>{
    if (!object.isMesh) return;
    object.castShadow=false;
    object.receiveShadow=false;
    if (object.userData.garagePart) parts.push(object);
    if (object.material.name==='Paint') paints.add(object.material);
    if (object.material.name==='Red') brakeLamps=object.material;
  });
  root.updateMatrixWorld(true);
  for (const part of parts) {
    const name=part.userData.garagePart;
    const index=Number(name.at(-1));
    (name.startsWith('wheel') ? wheels : hubs)[index]?.attach(part);
  }
  return {root,hubs,wheels,paints,brakeLamps};
}
