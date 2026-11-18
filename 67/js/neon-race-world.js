import * as THREE from 'three';
import { batchSharedMeshes } from './garage-visuals.js';

export function createRaceLights(world,course) {
  const group=new THREE.Group(), gate=new THREE.Group();
  group.visible=false;
  group.add(gate);
  const cyan=new THREE.MeshBasicMaterial({color:0x61f0ee});
  const violet=new THREE.MeshBasicMaterial({color:0xc59bff});
  const white=new THREE.MeshBasicMaterial({color:0xf5ffff});
  const black=new THREE.MeshStandardMaterial({color:0x192b37,roughness:.76});
  function box(parent,x,y,z,w,h,d,paint) {
    const mesh=world.box(parent,[w,h,d],[x,y,z],paint);
    mesh.castShadow=false;
    return mesh;
  }
  for(const side of [-1,1]) {
    box(gate,side*7.8,1.38,0,.18,2.76,.26,black);
    box(gate,side*7.66,1.58,-.04,.075,2.12,.17,cyan);
    box(gate,side*6.8,2.76,0,2,.10,.23,cyan);
  }
  const start=new THREE.Group(), origin=course.gates.at(-1);
  start.position.copy(origin.point);
  start.rotation.y=Math.atan2(origin.dir.x,origin.dir.z);
  group.add(start);
  for(let i=0;i<16;i++) for(let j=0;j<2;j++) {
    box(start,(i-7.5)*.85,.045,j*.43-.2,.85,.015,.42,(i+j)%2 ? white : black);
  }
  for(const side of [-1,1]) {
    box(start,side*7.7,1.72,0,.24,3.48,.34,black);
    box(start,side*7.7,3.46,0,.28,.08,.38,violet);
  }
  box(start,0,3.45,0,15.64,.26,.48,black);
  box(start,0,3.43,-.26,15.34,.066,.053,violet);
  world.textPlane(start,'КОНТУР 67  /  СТАРТ',7.1,.40,[0,3.75,-.28],[0,Math.PI,0],'#c3fef8','#182734');
  batchSharedMeshes(start);
  const crystal=new THREE.OctahedronGeometry(.57);
  const markers=course.pickups.map(({point,kind})=>{
    const marker=new THREE.Group();
    marker.position.copy(point);
    group.add(marker);
    const color=kind==='nitro' ? cyan : violet;
    const mesh=new THREE.Mesh(crystal,color);
    mesh.position.y=.88;
    marker.add(mesh);
    const base=new THREE.Mesh(new THREE.RingGeometry(.72,.83,16),color);
    base.rotation.x=-Math.PI/2;
    base.position.y=.055;
    marker.add(base);
    return {marker,mesh};
  });
  let lastGate=-1;
  return {group, update(run,now,started) {
    gate.visible=started && run.elapsed===undefined;
    if(run.next!==lastGate) {
      lastGate=run.next;
      const target=course.gates[lastGate];
      gate.position.copy(target.point);
      gate.rotation.y=Math.atan2(target.dir.x,target.dir.z);
    }
    for(const [index,{marker,mesh}] of markers.entries()) {
      marker.visible=gate.visible && run.available(index);
      if(!marker.visible) continue;
      mesh.rotation.set(.23,now*.002+index,0);
      mesh.position.y=.86+.14*Math.sin(now*.006+index);
    }
  }};
}
