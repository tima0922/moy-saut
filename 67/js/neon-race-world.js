import * as THREE from 'three';
import { batchSharedMeshes } from './garage-visuals.js';

export function createRaceLights(world,course,title) {
  const group=new THREE.Group();
  const gate=new THREE.Group();
  group.add(gate);
  const lit=color=>new THREE.MeshBasicMaterial({color});
  const cyan=lit(0x65f0e5),violet=lit(0xc3a5ff),white=lit(0xf6f4e9),black=lit(0x21333d);
  const red=lit(0xff7a57),green=lit(0xbff99a),dim=lit(0x4b5a5d);
  function box(parent,x,y,z,w,h,d,paint) {
    const mesh=world.box(parent,[w,h,d],[x,y,z],paint);
    mesh.castShadow=false;
    return mesh;
  }
  const posts=[-1,1].map(side=>{
    const post=new THREE.Group();
    gate.add(post);
    box(post,0,1.55,0,.25,3.1,.29,black);
    box(post,-side*.13,1.85,-.05,.09,2.48,.17,cyan);
    box(post,-side*.75,2.99,0,1.45,.11,.24,cyan);
    return post;
  });
  const start=new THREE.Group(),origin=course.gates.at(-1);
  const span=origin.half+.5;
  start.position.copy(origin.point);
  start.rotation.y=Math.atan2(origin.dir.x,origin.dir.z);
  group.add(start);
  const stripe=origin.half/8;
  for (let i=0;i<16;i++) for (let row=0;row<2;row++) {
    box(start,(i-7.5)*stripe,.049,row*.48-.24,stripe,.018,.47,(i+row)%2 ? white : black);
  }
  for (const side of [-1,1]) {
    box(start,side*span,2.62,0,.35,5.24,.46,black);
    box(start,side*span,5.16,0,.39,.13,.49,cyan);
  }
  box(start,0,5.09,0,2*span+.28,.38,.60,black);
  box(start,0,4.91,-.32,2*span,.067,.06,cyan);
  world.textPlane(start,title,8.8,.66,[0,5.63,-.35],[0,Math.PI,0],'#e0fffb','#21333d');
  batchSharedMeshes(start);
  const bulbs=[-1,0,1].map(n=>box(start,n*.54,4.75,0,.27,.24,.38,dim));
  const crystal=new THREE.OctahedronGeometry(.59);
  const ring=new THREE.RingGeometry(.76,.88,16);
  const markers=course.pickups.map(({point,kind})=>{
    const marker=new THREE.Group();
    marker.position.copy(point);
    group.add(marker);
    const color=kind==='nitro' ? cyan : violet;
    const mesh=new THREE.Mesh(crystal,color);
    mesh.position.y=.91;
    marker.add(mesh);
    const base=new THREE.Mesh(ring,color);
    base.rotation.x=-Math.PI/2;
    base.position.y=.075;
    marker.add(base);
    return {marker,mesh};
  });
  let lastGate=-1;
  return {
    group,
    update(run,now,raceTime,position,range) {
      const started=raceTime>=run.startsAt;
      const seconds=Math.ceil((run.startsAt-raceTime)/1000);
      for (const [i,lamp] of bulbs.entries()) lamp.material=started ? green : i<4-seconds ? red : dim;
      gate.visible=started && run.elapsed===undefined;
      if (run.next!==lastGate) {
        lastGate=run.next;
        const target=course.gates[lastGate];
        gate.position.copy(target.point);
        gate.rotation.y=Math.atan2(target.dir.x,target.dir.z);
        posts[0].position.x=-target.half;
        posts[1].position.x=target.half;
      }
      for (const [index,{marker,mesh}] of markers.entries()) {
        marker.visible=gate.visible && run.available(index) &&
          Math.abs(position.x-marker.position.x)<range && Math.abs(position.z-marker.position.z)<range;
        if (!marker.visible) continue;
        mesh.rotation.set(.23,now*.002+index,0);
        mesh.position.y=.86+.14*Math.sin(now*.006+index);
      }
    },
  };
}
