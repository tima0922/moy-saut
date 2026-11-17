import * as THREE from 'three';
import { batchSharedMeshes } from './garage-visuals.js';
import { createTireEffects } from './drift-world.js?v=024';

const START = 503;
const SPAN = 154;
const DECK = 14;
const HULL = .95;
const sections = [
  {title:'Разгонный пирс',x:0,speed:55,jumps:[[44,57,4,0,2.45,1.35,10]],down:[88,104,1.35]},
  {title:'Контейнерная змейка',x:-8,speed:37,slalom:[[48,1],[78,-1],[108,1]]},
  {title:'Узкий мост',x:2,speed:51,narrow:[[36,78,5.8]],
    jumps:[[84,96,4.5,0,2.3,1.05,8]],down:[119,133,1.05]},
  {title:'Двойной трамплин',x:10,speed:55,jumps:[[41,53,4,0,2.4,1.1,10],[84,96,5,1.1,3.55,2,9]],down:[115,134,2]},
  {title:'Верхняя эстакада',x:-6,speed:45,hills:[[38,55,0,2.8],[62,75,2.8,4.5]],
    narrow:[[55,62,6.3],[75,112,6.8]],down:[112,134,4.5]},
  {title:'Пролёт над доком',x:-6,speed:76,jumps:[[55,72,11,0,4.3,1.65,10]],down:[112,130,1.65]},
  {title:'Прыжок с высоты',x:8,speed:57,hills:[[34,52,0,3.6]],
    jumps:[[72,84,9,3.6,4.8,.95,9]],down:[118,134,.95]},
  {title:'Складские ворота',x:4,speed:36,slalom:[[43,-1],[69,1],[95,-1],[119,1]]},
  {title:'Гребёнка',x:-10,speed:51,hills:[[32,41,0,1.0],[43,53,1.0,0],[58,68,0,1.25],[70,81,1.25,0]],
    jumps:[[91,103,5,0,2.45,.9,9]],down:[120,134,.9]},
  {title:'Финишный пролёт',x:0,speed:70,jumps:[[54,72,9,0,4,1.25,11]],down:[109,132,1.25]},
];
const END = START+SPAN*sections.length;
const arena = {x:0,z:(START+END)/2,w:100,d:END-START};
export const PORT_SPAWN = {x:0,z:515,y:0,yaw:Math.PI};
const FINISH = END-6;

export const PORT_GATES = sections.map((section,i)=>({
  x:section.x,z:i===sections.length-1 ? FINISH : START+i*SPAN+141,y:0,w:DECK,
  label:i===sections.length-1 ? 'Финиш' : section.title,
}));
export const PORT_LENGTH = FINISH-PORT_SPAWN.z;

function pierSections() {
  return sections.map((section,index)=>{
    const z = START+index*SPAN;
    const x = section.x;
    const previous = sections[index-1]?.x ?? x;
    const decks = [{x:(previous+x)/2,a:z,b:z+30,w:DECK+Math.abs(x-previous),y0:0,y1:0}];
    const features = [
      ...(section.jumps ?? []).map(([from,lip,gap,low,high,landing,width])=>({from,to:lip,low,high,width,gap,landing})),
      ...(section.hills ?? []).map(([from,to,low,high])=>({from,to,low,high,width:DECK})),
      ...(section.down ? [{from:section.down[0],to:section.down[1],low:section.down[2],high:0,width:DECK}] : []),
      ...(section.narrow ?? []).map(([from,to,width])=>({from,to,width})),
    ].sort((a,b)=>a.from-b.from);
    let last = 30, height = 0;
    const deck = (a,b,w,y0,y1)=>decks.push({x,a:z+a,b:z+b,w,y0,y1});
    for (const feature of features) {
      if (feature.from>last) deck(last,feature.from,DECK,height,height);
      deck(feature.from,feature.to,feature.width,feature.low ?? height,feature.high ?? height);
      last = feature.to+(feature.gap ?? 0);
      height = feature.landing ?? feature.high ?? height;
    }
    if (last<SPAN) deck(last,SPAN,DECK,height,height);
    return {...section,z,previous,decks,gate:PORT_GATES[index]};
  });
}
export const PORT_SECTORS = pierSections();

export function portLayout() {
  const road = [PORT_SPAWN,...PORT_GATES].flatMap((gate,i)=>i ? [
    {x:gate.x,z:START+(i-1)*SPAN+29},gate,
  ] : [gate]).map(({x,z})=>new THREE.Vector3(x,0,z));
  const direction = new THREE.Vector3(0,0,1);
  return {port:true,arena,spawn:PORT_SPAWN,road,gates:PORT_GATES.map(gate=>({
    position:new THREE.Vector3(gate.x,gate.y,gate.z),direction,
  }))};
}

export function portMapView(z) {
  const start = THREE.MathUtils.clamp(z-23,START,END-130);
  return `-46 ${-start-130} 92 130`;
}

export function outOfPort({x,y,z}) {
  return y < -3.1 || z<START-7 || z>END+12 || Math.abs(x)>47;
}

function crossing(last,pose,gate) {
  if (!last || last.z>=gate.z || pose.z<gate.z) return false;
  const alpha = (gate.z-last.z)/(pose.z-last.z);
  const across = last.x+(pose.x-last.x)*alpha;
  const height = last.y+(pose.y-last.y)*alpha;
  // The car just has to cross the striped road section, including its curb.
  return Math.abs(across-gate.x)<=gate.w/2+HULL && height>=gate.y-.65 && height<=gate.y+3.7;
}

export function portCourse(startAt) {
  let next = 0, resets = 0, last, finished, missedFinish = false;
  return {
    get next() { return next; },
    get resets() { return resets; },
    get elapsed() { return finished; },
    get gate() { return PORT_GATES[next]; },
    get missedFinish() { return missedFinish; },
    reset() {
      if (finished!==undefined) return null;
      resets++;
      last = undefined;
      missedFinish = false;
      const gate = PORT_GATES[next-1];
      return gate ? {x:gate.x,z:gate.z+2.2,y:gate.y,yaw:Math.PI} : PORT_SPAWN;
    },
    tick(now,{x,y,z}) {
      if (finished!==undefined || now<startAt) return;
      const pose = {x,y,z};
      while (next<PORT_GATES.length && crossing(last,pose,PORT_GATES[next])) {
        missedFinish = false;
        if (++next===PORT_GATES.length) finished = Math.max(0,Math.round(now-startAt));
      }
      if (finished===undefined && last?.z<FINISH && z>=FINISH) missedFinish = true;
      last = pose;
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
  const steel=material(0x525d65), deck=material(0x70797d), yellow=material(0xf6bc50);
  const ink=material(0x222f36), aqua=material(0x287d82), rust=material(0xa55838), light=material(0xf2ead4);
  const colors=[rust,aqua,steel];
  const water=new THREE.Mesh(new THREE.PlaneGeometry(126,END-START+40),new THREE.MeshBasicMaterial({color:0x214655}));
  water.rotation.x=-Math.PI/2;
  water.position.set(0,-4.1,arena.z);
  group.add(water);
  const chunks = [], cameraShapes = [];
  let visibleFirst=-1,visibleLast=-1;

  PORT_SECTORS.forEach((section,index)=>{
    const chunk = new THREE.Group();
    chunks.push(chunk);
    const sectionObstacles = [];
    cameraShapes.push(sectionObstacles);
    group.add(chunk);
    const block=(x,y,z,w,h,d,paint,pitch=0)=>{
      const mesh=box(chunk,[w,h,d],[x,y,z],paint,[pitch,0,0]);
      mesh.castShadow=false;
      return mesh;
    };
    function structure(x,y,z,w,h,d,paint,pitch=0,drivable=false) {
      const mesh=block(x,y,z,w,h,d,paint,pitch);
      const shape = {x,y:y-h/2,z,w,h,d,pitch,drivable};
      obstacles.push(shape);
      if (!drivable) sectionObstacles.push(shape);
      return mesh;
    }
    for (const {x,a,b,w,y0,y1} of section.decks) {
      const middle=(y0+y1)/2,pitch=-Math.atan2(y1-y0,b-a),depth=Math.hypot(b-a,y1-y0),z=(a+b)/2;
      structure(x,middle-.45*Math.cos(pitch),z-.45*Math.sin(pitch),w,.9,depth,deck,pitch,true).receiveShadow=true;
      for (const side of [-1,1]) {
        block(x+side*(w/2-.14),middle+.023,z,.14,.018,depth,yellow,pitch);
      }
      if (pitch<-.09) for (let k=1;k<=3;k++) {
        const t=k/4;
        block(x,y0+(y1-y0)*t+.025,a+(b-a)*t,w-.4,.025,.26,k%2 ? yellow : ink,pitch);
      }
    }

    // The repeated scenery is decorative and batched per section; only course blockers need colliders.
    for (let n=0;n<6;n++) {
      const side=n%2 ? 1 : -1;
      const x=section.x+side*(15+(n%3)*2.1);
      const z=section.z+38+n*17;
      const y=-2.1+(n%2)*.6;
      block(x,y,z,3.2,3.5,11.5,colors[(index+n)%colors.length]);
      for (let rib=0;rib<6;rib++) block(x-side*1.63,y,z-4.75+rib*1.9,.08,3.35,.11,ink);
      block(x,y+1.78,z,3.3,.12,11.6,steel);
    }

    for (const [along,side] of section.slalom ?? []) {
      const x=section.x+side*3.25,z=section.z+along;
      structure(x,.82,z,7,1.64,3.3,index%2 ? rust : aqua);
      for (let j=0;j<7;j++) block(x+(j-3)*.94,.64,z-1.67,.53,.32,.03,j%2?ink:yellow);
    }

    const finish=index===sections.length-1;
    const {x,z,y,w}=section.gate;
    const edgeColor=finish ? light : aqua;
    for (const side of [-1,1]) {
      structure(x+side*(w/2+.15),y+1.35,z,.28,2.7,.35,edgeColor);
      block(x+side*(w/2+.15),y+2.8,z,.39,.43,.43,yellow);
    }
    block(x,y+3.1,z,w+.7,.25,.30,ink);
    for (let stripe=0;stripe<16;stripe++) {
      for (let row=0;row<2;row++) if ((row+stripe)%2===0) {
        block(x+(stripe-7.5)*w/16,y+.023,z+(row-.5)*.42,w/16,.018,.42,finish?light:yellow);
      }
    }
    textPlane(chunk,finish ? 'ФИНИШ' : `${String(index+1).padStart(2,'0')} / 10`,
      5.5,.57,[x,y+3.29,z-.19],[0,Math.PI,0],'#fff5d9','#263b44');
    textPlane(chunk,section.title.toUpperCase()+` · ${section.speed} КМ/Ч`,12,.62,
      [(section.previous+section.x)/2,3.8,section.z+22],[0,Math.PI,0],'#ffe6a7','#263b44');
    if (finish) structure(x,.7,END-.5,DECK,1.4,.55,steel);
    batchSharedMeshes(chunk);
  });

  const cameraBuckets = cameraShapes.map((_,i)=>cameraShapes.slice(Math.max(0,i-1),i+2).flat());
  return {
    group,obstacles,fx:createTireEffects(group),markGate() {},
    cameraNear(z) {
      return cameraBuckets[THREE.MathUtils.clamp(Math.floor((z-START)/SPAN),0,chunks.length-1)];
    },
    showAround(z,far) {
      const first=Math.max(0,Math.floor((z-Math.min(far,90)-START)/SPAN));
      const last=Math.min(chunks.length-1,Math.floor((z+far+28-START)/SPAN));
      if (first===visibleFirst && last===visibleLast) return;
      visibleFirst=first;
      visibleLast=last;
      chunks.forEach((chunk,index)=>{chunk.visible=index>=first && index<=last;});
    },
  };
}
