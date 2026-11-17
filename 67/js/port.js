import * as THREE from 'three';
import { batchSharedMeshes } from './garage-visuals.js';
import { createTireEffects } from './drift-world.js?v=024';

const arena = {x:8,z:590,w:76,d:204};
export const PORT_SPAWN = {x:0,z:515,y:0,yaw:Math.PI};
export const PORT_GATES = [
  {x:0,z:573,y:1.35,w:9, label:'Посадочная палуба'},
  {x:0,z:609,y:.25,w:5.8,label:'Узкий проезд'},
  {x:3,z:633,y:.25,w:16,respawnX:8,respawnZ:623,label:'Вторая рампа'},
  {x:8,z:667,y:1.35,w:7,label:'Финиш'},
];
const segments = [
  [0,503,542,13,0,0], [0,542,554,9,0,2.5],
  [0,558,584,11,1.35,1.35], [0,584,594,9,1.35,.25],
  [0,594,616,6.8,.25,.25], [3,616,635,19,.25,.25], [8,635,646,8,.25,2.55],
  [8,650,681,8,1.35,1.35],
];

export function portLayout() {
  const positions = [[0,515],[0,554],[0,584],[0,609],[0,620],[8,629],[8,646],[8,675]]
    .map(([x,z])=>new THREE.Vector3(x,0,z));
  const heading = new THREE.Vector3(0,0,1);
  return {port:true,arena,spawn:PORT_SPAWN,road:positions,gates:PORT_GATES.map(gate=>({
    position:new THREE.Vector3(gate.x,gate.y,gate.z),direction:heading,
  }))};
}

export function portCourse(startAt) {
  let next = 0, resets = 0, last, finished;
  return {
    get next() { return next; },
    get resets() { return resets; },
    get elapsed() { return finished; },
    get gate() { return PORT_GATES[next]; },
    reset() {
      if (finished!==undefined) return null;
      resets++;
      last = null;
      const checkpoint = PORT_GATES[next-1];
      return checkpoint ? {x:checkpoint.respawnX ?? checkpoint.x,z:checkpoint.respawnZ ?? checkpoint.z+1.6,y:checkpoint.y,yaw:Math.PI} : PORT_SPAWN;
    },
    tick(now,{x,y,z}) {
      if (finished!==undefined || now<startAt) return;
      const gate = PORT_GATES[next];
      if (last && last.z<gate.z && z>=gate.z) {
        const alpha = (gate.z-last.z)/(z-last.z);
        const across = last.x+(x-last.x)*alpha;
        const height = last.y+(y-last.y)*alpha;
        if (Math.abs(across-gate.x)<=gate.w/2 && height>=gate.y-.17 && height<=gate.y+1.8) {
          if (++next===PORT_GATES.length) finished = Math.max(0,Math.round(now-startAt));
        }
      }
      last = {x,y,z};
    },
  };
}

export function portWorld(world) {
  const {scene,box,textPlane} = world;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const obstacles = [];
  const material = color=>new THREE.MeshStandardMaterial({color,roughness:.84});
  const steel=material(0x525d65), deck=material(0x737776), yellow=material(0xf6bc50);
  const ink=material(0x222f36), aqua=material(0x287d82), rust=material(0xa55838);
  const light=material(0xe3eee2);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(105,212),new THREE.MeshBasicMaterial({color:0x214655}));
  water.rotation.x=-Math.PI/2;
  water.position.set(5,-4.1,589);
  group.add(water);

  function structure(x,y,z,w,h,d,paint,pitch=0,drivable=false) {
    const mesh=box(group,[w,h,d],[x,y,z],paint,[pitch,0,0]);
    mesh.castShadow=false;
    obstacles.push({x,y:y-h/2,z,w,h,d,pitch,drivable});
    return mesh;
  }
  for (const [x,start,end,w,low,high] of segments) {
    const middle=(low+high)/2;
    const pitch=-Math.atan2(high-low,end-start);
    const depth=Math.hypot(end-start,high-low), z=(start+end)/2;
    structure(x,middle-.45*Math.cos(pitch),z-.45*Math.sin(pitch),w,.9,depth,deck,pitch,true).receiveShadow=true;
    for (const side of [-1,1]) {
      box(group,[.12,.022,depth],[x+side*(w/2-.15),middle+.024,z],yellow,[pitch,0,0]).castShadow=false;
    }
    if (pitch) {
      for (let k=1;k<=3;k++) {
        const t=k/4;
        box(group,[w-.4,.025,.24],[x,low+(high-low)*t+.024,start+(end-start)*t],k%2?yellow:ink,[pitch,0,0]).castShadow=false;
      }
    } else {
      for (const upright of [start+1.2,end-1.2]) {
        for (const side of [-1,1]) structure(x+side*(w/2-.65),-2.2,upright,.9,3.5,.9,steel);
      }
    }
  }

  function container(x,z,color) {
    structure(x,-1.3,z,3,3.8,11.6,color);
    for (let i=0;i<13;i++) {
      const rz=z-5.4+i*.9;
      for (const side of [-1,1]) box(group,[.075,3.36,.14],[x+side*1.52,-1.15,rz],ink).castShadow=false;
    }
    box(group,[3.05,.12,11.7],[x,.61,z],steel).castShadow=false;
  }
  for (const [x,z,paint] of [[-11,526,rust],[11,532,aqua],[-12,563,aqua],[13,569,rust],[-9,605,rust],[8,605,aqua],
    [-10,630,aqua],[22,636,rust],[-6,665,rust],[20,672,aqua]]) container(x,z,paint);

  for (const [index,{x,z,y,w,label}] of PORT_GATES.entries()) {
    for (const side of [-1,1]) structure(x+side*(w/2+.32),y+1.1,z,.22,2.2,.24,aqua);
    box(group,[w+.85,.27,.29],[x,y+2.25,z],ink).castShadow=false;
    textPlane(group,index===PORT_GATES.length-1 ? 'ФИНИШ' : `0${index+1} · ${label.toUpperCase()}`,
      w+.5,.38,[x,y+2.31,z-.17],[0,Math.PI,0],'#fff5d9','#263b44');
    for (let line=0;line<8;line++) {
      if (line%2) continue;
      box(group,[w/8,.02,.45],[x+(line-3.5)*w/8,y+.027,z],light).castShadow=false;
    }
  }
  textPlane(group,'РАЗГОН ДО ПРЫЖКА · 45–60 КМ/Ч',10,.65,[0,3.3,532],[0,Math.PI,0],'#ffe6a7','#263b44');
  textPlane(group,'↗  ВТОРАЯ РАМПА',7,.75,[7,3,628],[0,Math.PI,0],'#fcdd91','#263b44');
  structure(8,2,681,8,1.3,.5,steel);
  batchSharedMeshes(group);
  return {group,obstacles,fx:createTireEffects(group),markGate() {}};
}
