import * as THREE from 'three';

const BERTH = 5950;
const SAIL = 8150;
const PERIOD = 2*(BERTH+SAIL);

export function portFerry(sector) {
  const h=.64, d=12;
  const start=sector.z+60+d/2+.075;
  const end=sector.z+106-d/2-.075;
  return {x:-11,z:start,y:1.25-h,h,d,w:5.94,start,end,top:1.25,drivable:true};
}

export function ferryFrame(ferry,time) {
  const phase=(Math.max(0,time)+3400)%PERIOD;
  const half=BERTH+SAIL;
  const returning=phase>=half;
  const local=phase%half;
  const docked=local<BERTH;
  const progress=docked ? 0 : (local-BERTH)/SAIL;
  const eased=progress*progress*(3-2*progress);
  const fraction=returning ? 1-eased : eased;
  const {x,start,end,top,h}=ferry;
  return {
    state:docked ? returning ? 'unload' : 'board' : returning ? 'return' : 'sailing',
    remaining:(docked ? BERTH : half)-local,
    pose:{x,y:top-h/2+2.2*Math.sin(Math.PI*fraction)**2,z:start+(end-start)*fraction},
  };
}

export function ferryPrompt(ferry,x,z,time) {
  if (Math.abs(x-ferry.x)>4 || z<ferry.start-33 || z>ferry.end+7) return null;
  const {state,remaining,pose}=ferryFrame(ferry,time);
  const aboard=Math.abs(z-pose.z)<ferry.d/2;
  if (state==='board') return {state:'open',remaining,label:aboard ? 'ПЛАТФОРМА · ЗАТЯНИ РУЧНИК' : 'ПЛАТФОРМА · ЗАЕЗЖАЙ'};
  if (state==='unload' && aboard) return {state:'open',remaining,label:'ПЛАТФОРМА · СЪЕЗЖАЙ'};
  if (!aboard) return {state:'closed',remaining:state==='return' ? remaining : remaining+(state==='sailing' ? BERTH+SAIL : SAIL),
    label:'ЖДИ ПЛАТФОРМУ'};
  return {state:'opening',remaining,label:'ПЛАТФОРМА В ПУТИ · ДЕРЖИ РУЧНИК'};
}

export function buildFerry(chunk,world,ferry,paint) {
  const carriage=new THREE.Group();
  carriage.name='Crane platform';
  chunk.add(carriage);
  const amber=new THREE.MeshBasicMaterial({color:0xffae53});
  const dockGreen=new THREE.MeshBasicMaterial({color:0x68dec3});
  const railY=9.9;
  const {x,start,end,w,h,d}=ferry;
  const center=(start+end)/2, length=end-start+16;
  function box(parent,x,y,z,w,h,d,material) {
    const mesh=world.box(parent,[w,h,d],[x,y,z],material);
    mesh.castShadow=false;
    return mesh;
  }
  for (const side of [-1,1]) {
    const edge=x+side*3.62;
    box(chunk,edge,railY,center,.42,.55,length,paint.steel);
    box(chunk,edge,railY+.34,center,.18,.17,length,paint.yellow);
    for (const z of [start-8.15,end+8.15]) {
      box(chunk,x+side*2.86,1.34,z,.17,.15,.63,paint.ink);
      box(chunk,x+side*2.868,1.422,z,.12,.021,.46,dockGreen);
    }
    for (const z of [start-4,end+4]) {
      box(chunk,edge,1.23,z,.54,17.5,.63,paint.steel);
      box(chunk,edge,.05,z,.99,.72,1.02,paint.ink);
      box(chunk,edge,7.0,z,.59,.76,.68,paint.yellow);
    }
  }
  for (const z of [start-4,center,end+4]) box(chunk,x,railY,z,7.75,.56,.55,paint.steel);
  const trolley=new THREE.Group();
  chunk.add(trolley);
  box(trolley,x,railY-.32,0,7.6,.7,2.5,paint.ink);
  box(trolley,x,railY-.76,0,4.4,.47,2,paint.rust);
  box(trolley,x,railY-.46,-1.29,.88,.24,.12,amber);

  box(carriage,0,0,0,w,h,d,paint.steel);
  box(carriage,0,-.32,0,w*.77,.40,d*.83,paint.ink);
  for (const side of [-1,1]) {
    box(carriage,side*(w*.5-.15),h*.5+.013,0,.22,.026,d,paint.yellow);
    for (const z of [-4.85,4.85]) {
      box(carriage,side*(w*.5-.18),h*.5+.22,z,.26,.39,.34,paint.rust);
    }
  }
  for (const z of [-4.2,4.2]) for(let i=0;i<7;i++) {
    box(carriage,0,h*.5+.012,z+(i-3)*.24,4.2,.023,.12,i%2 ? paint.ink : paint.yellow);
  }
  for (let stripe=-3;stripe<=3;stripe++) {
    box(carriage,0,h*.5+.018,stripe*.69,.11,.021,.46,paint.light);
  }
  const cableRig=new THREE.Group();
  chunk.add(cableRig);
  const cables=[];
  for (const side of [-1,1]) for (const end of [-1,1]) {
    const cable=box(cableRig,x+side*(w*.5-.18),0,end*4.85,.035,1,.035,paint.ink);
    cables.push({cable,offset:end*4.85});
  }
  world.textPlane(chunk,'СПРАВА: ПЛАТФОРМА  /  ПРЯМО: УЗКИЙ МОСТ',12,.54,[-3,3.1,start-43],[0,Math.PI,0],'#f4dcaa','#233b43');
  world.textPlane(chunk,'СТОП · ЖДИ ПЛАТФОРМУ',5.8,.40,[x,2.8,start-13],[0,Math.PI,0],'#f4dcaa','#233b43');
  return {carriage,trolley,cables,railY,amber};
}

export function updateFerry(visual,ferry,time) {
  const {pose,state}=ferryFrame(ferry,time);
  visual.carriage.position.set(pose.x,pose.y,pose.z);
  visual.trolley.position.z=pose.z;
  const base=pose.y+ferry.h/2+.36;
  const span=visual.railY-.54-base;
  for (const {cable,offset} of visual.cables) {
    cable.position.z=pose.z+offset;
    cable.position.y=base+span/2;
    cable.scale.y=span;
  }
  visual.amber.color.setHex(state==='board' || state==='unload' ? 0x75f4aa : 0xffb862);
}
