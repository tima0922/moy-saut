import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dockMaterials,addDockScenery } from './port-scenery.js?v=028';
import { HARBOR_WATER,harborScenery } from './port-harbor.js?v=028';
import { buildPortHazard,portHazards,portHazardPose,portSignal } from './port-hazards.js?v=028';
import { batchSharedMeshes } from './garage-visuals.js';
import { createTireEffects } from './drift-world.js?v=024';

const START = 503;
export const PORT_SPAN = 154;
const SPAN = PORT_SPAN;
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
  {title:'Прыжок над сухогрузом',x:-6,speed:82,ship:true,
    jumps:[[53,72,15,0,4.65,1.48,8]],narrow:[[87,112,5.8]],down:[112,131,1.48]},
  {title:'Прыжок с высоты',x:8,speed:57,hills:[[34,52,0,3.6]],
    jumps:[[72,84,9,3.6,4.8,.95,9]],down:[118,134,.95]},
  {title:'Складские ворота',x:4,speed:36,slalom:[[43,-1],[69,1],[95,-1],[119,1]]},
  {title:'Гребёнка',x:-10,speed:51,hills:[[32,41,0,1.0],[43,53,1.0,0],[58,68,0,1.25],[70,81,1.25,0]],
    jumps:[[91,103,5,0,2.45,.9,9]],down:[120,134,.9]},
  {title:'Длинный пирс',x:0,speed:70,jumps:[[54,72,9,0,4,1.25,11]],down:[109,132,1.25]},
  {title:'Игольное ушко',x:-7,speed:41,narrow:[[38,61,3.45],[76,111,3.65,2.6]],
    line:[[32,0],[56,0],[73,2.6],[114,2.6],[128,0]]},
  {title:'Косая посадка',x:5,speed:62,jumps:[[49,65,7.5,0,3.15,1.25,8]],
    narrow:[[72.5,96,4.1,3.8]],line:[[45,0],[58,1.2],[76,3.7],[91,3.8],[114,0]],down:[104,129,1.25]},
  {title:'Дальняя посадка над фарватером',x:5,speed:79,ship:true,pace:[[86,79],[154,42]],
    jumps:[[52,71,14,0,4.65,1.5,6.3]],narrow:[[85,115,3.65]],down:[115,136,1.5]},
  {title:'Слалом без бортов',x:-5,speed:35,narrow:[[31,131,8.7]],
    slalom:[[43,1,2.5,4.8],[66,-1,2.5,4.8],[89,1,2.5,4.8],[112,-1,2.5,4.8]]},
  {title:'Короткая посадка',x:8,speed:57,jumps:[[44,59,6,0,3,1.3,7],[83,95,5.8,1.3,3.8,1.55,6.4]],
    narrow:[[65,83,4.45],[100.8,120,4.4]],down:[120,138,1.55]},
  {title:'Под крановой балкой',x:0,speed:53,jumps:[[48,64,6,0,3.3,1.4,7]],
    narrow:[[70,109,4.7]],arches:[[88,1.4,4.7,2.15]],down:[110,132,1.4]},
  {title:'Боковая лестница',x:-9,speed:33,hills:[[35,54,0,2.4,6.3],[64,80,2.4,4.3,5.2,2]],
    narrow:[[54,64,5,1],[80,96,4,-.5],[103,119,4.5,-2.35]],
    line:[[45,0],[59,.9],[72,2],[91,-.7],[109,-2.35],[124,-2.35],[136,0]],down:[119,138,4.3]},
  {title:'Два дока',x:6,speed:63,jumps:[[46,60,7,0,3.25,1.2,7],[82,96,8,1.2,4.5,1.85,6.3]],
    narrow:[[67,82,5.35],[104,121,4.25]],down:[121,138,1.85]},
  {title:'Змейка над водой',x:0,speed:34,hills:[[32,46,0,2.2,7.8]],
    narrow:[[46,128,8.2]],slalom:[[55,-1,2.35,4.4,2.2],[79,1,2.35,4.4,2.2],[103,-1,2.35,4.4,2.2],[122,1,2.35,4.4,2.2]],down:[128,139,2.2]},
  {title:'Прыжок из-под крыши',x:-7,speed:58,arches:[[52,0,5.2,1.9]],
    jumps:[[59,72,7,0,3.2,1.1,5.6]],narrow:[[36,59,5],[79,111,4.25]],down:[113,134,1.1]},
  {title:'Лезвие над причалом',x:0,speed:31,
    routeDecks:[[30,36,0,0,0,0,14],[36,54,0,0,0,3.5,4.6],[54,68,0,-1.14,3.5,3.5,3.68],
      [68,81,-1.14,-1.14,3.5,3.5,3.2],[81,99,-1.14,1.25,3.5,3.5,3.34],
      [99,119,1.25,1.25,3.5,3.5,3.22],[119,139,1.25,0,3.5,0,6.3],[139,154,0,0,0,0,14]],
    line:[[54,0],[68,-1.14],[81,-1.14],[99,1.25],[119,1.25],[139,0]]},
  {title:'Падение на полку',x:9,speed:58,hills:[[37,55,0,4.4,7]],
    jumps:[[67,80,9,4.4,5.45,1.05,6.7]],narrow:[[89,111,4.1,-3.15]],
    line:[[59,0],[71,-.7],[88,-3.15],[105,-3.15],[126,0]],down:[113,137,1.05]},
  {title:'Торможение у контейнеров',x:-3,speed:68,pace:[[64,68],[83,40],[154,35]],line:[[62,-1.4],[91,-3.1],[99,-3.1],[117,3.15],[125,3.15],[140,0]],
    jumps:[[48,64,8,0,3.6,0,8]],slalom:[[94,1,2.75,6.5],[123,-1,2.75,6.5]]},
  {title:'Двойные шпалы',x:4,speed:54,hills:[[33,41,0,1.15,6.4],[45,53,1.15,0,6.4],
    [59,66,0,1.45,6.3],[70,79,1.45,0,6.3]],jumps:[[88,101,7,0,2.8,1,6]],
    narrow:[[108,120,4.6]],down:[120,138,1]},
  {title:'Ножницы',x:-5,speed:59,jumps:[[41,54,5.5,0,2.55,1,7],[85,98,6.5,1,3.9,1.6,7]],
    narrow:[[59.5,78,4.4,3.55],[104.5,122,4.35,-3.35]],
    line:[[38,0],[52,1.75],[68,3.45],[76,3.25],[91,-1.25],[108,-3.3],[118,-3.1],[136,0]],down:[122,138,1.6]},
  {title:'Контейнеровоз под колёсами',x:-5,speed:86,ship:true,pace:[[90,86],[154,48]],
    jumps:[[53,73,17,0,5.4,1.4,6.2]],narrow:[[90,115,3.85]],down:[115,139,1.4]},
  {title:'Опоры крана',x:6,speed:35,hills:[[33,49,0,2.75,8.1]],narrow:[[49,126,8.6]],
    slalom:[[57,1,2.45,4.7,2.75],[81,-1,2.45,4.7,2.75],[104,1,2.45,4.7,2.75]],down:[126,140,2.75]},
  {title:'Тройной трамплин',x:0,speed:61,jumps:[[40,52,4.8,0,2.35,.85,7],
    [75,87,5.4,.85,3.5,1.5,6.6],[104,113.5,6.4,1.5,4.2,1.7,6.3]],
    narrow:[[56.8,75,5.5],[92.4,104,5],[119.9,132,4.5]],down:[132,140,1.7]},
  {title:'Висячая эстакада',x:-8,speed:36,hills:[[34,54,0,4.7,5.7]],
    narrow:[[54,72,3.65],[80,101,3.7,-2.7],[110,123,3.55,2.7]],
    line:[[69,0],[84,-2.8],[97,-2.55],[114,2.7],[120,2.6],[136,0]],down:[123,139,4.7]},
  {title:'Последний пролёт',x:0,speed:83,jumps:[[50,73,16,0,5.4,1.5,7]],
    narrow:[[89,118,4.15,3.3]],line:[[43,0],[62,.9],[86,3.1],[112,3.3],[137,0]],down:[118,139,1.5]},
];
// Decks use the center at each end: start Z, end Z, start X, end X, start height, end height, width.
const rebuilt = {
  4:{title:'Прыжок по диагонали',speed:54,
    routeDecks:[[30,47,0,3,0,0,12],[47,62,3,6.5,0,2.75,7.6],[69,94,8.3,10,1.1,1.1,6.7,'roof'],
      [94,104,10,8,1.1,2.45,7.5],[109,130,6.7,1,.2,0,9],[130,154,1,0,0,0,14]],
    line:[[32,0],[48,3],[60,5.7],[70,8],[94,9.6],[104,8.1],[119,4.6],[133,0]]},
  8:{title:'Крановая развилка',speed:56,branch:['ЛЕВО · 58 КМ/Ч','ПРАВО · 76 КМ/Ч'],
    routeDecks:[[30,44,0,0,0,0,24],
      [44,52,-6,-6,0,0,7.2],[52,65,-6,-6,0,2.5,7],
      [72,101,-6,-6,1.1,1.1,6],[101,123,-6,0,1.1,0,8],
      [44,53,6,6,0,0,7.2],[53,69,6,6,0,4,6.8],
      [80,104,6,6,2,2,4.9],[104,123,6,0,2,0,7.3],[123,154,0,0,0,0,14]],
    line:[[31,0],[44,-6],[103,-6],[126,0],[140,0]],
    alternate:{speed:76,line:[[31,0],[46,6],[108,6],[128,0],[140,0]]}},
  12:{title:'Слепая посадка',speed:57,
    routeDecks:[[30,46,0,-2,0,0,11],[46,63,-2,-5,0,3.05,7],
      [70,93,-7,-8.2,1.15,1.15,5.55],[93,119,-8.2,-4,1.15,.25,7],
      [119,137,-4,0,.25,0,8],[137,154,0,0,0,0,14]],
    line:[[31,0],[45,-2],[62,-5],[78,-7.8],[94,-8],[119,-4.7],[138,0]]},
  16:{title:'Спуск на баржу',speed:57,
    routeDecks:[[30,52,0,0,0,4.15,9],[52,67,0,0,4.15,4.15,8],
      [67,74,0,1.5,4.15,4.4,7.3],[82,105,4,5.3,.6,.6,6.1,'barge'],[105,116,5.3,5.2,.6,1.55,6.1],
      [120.5,137,4.5,0,.3,0,8],[137,154,0,0,0,0,14]],
    line:[[54,0],[66,.3],[76,2.6],[91,4.8],[109,5.35],[121,4.25],[137,0]]},
  18:{title:'Прыжок на крышу склада',speed:68,
    routeDecks:[[30,47,0,0,0,1.35,9],[47,64,0,2,1.35,5.35,7],
      [72,101,3.5,5,4.85,4.85,6.25,'roof'],[101,107,5,4.2,4.85,4.85,6.25],
      [115,130,3,1.4,1.45,.65,8],[130,140,1.4,0,.65,0,9],[140,154,0,0,0,0,14]],
    line:[[44,0],[60,1.3],[77,3.9],[99,4.8],[109,4.2],[123,2],[140,0]]},
  22:{title:'Контейнерные крыши',speed:62,
    routeDecks:[[30,47,0,-1.4,0,1.1,12],[47,64,-1.4,-4,1.1,4.25,7.8],
      [71,93,-5.4,-5.4,3.35,3.35,5.8,'containers'],
      [93,103,-5.4,-3.2,3.35,4.9,6.1],[109,127,-.9,0,2.8,2.8,6.2,'containers'],
      [127,141,0,0,2.8,0,10],[141,154,0,0,0,0,14]],
    line:[[36,-.4],[56,-3],[74,-5.4],[91,-5.4],[103,-2.85],[114,-.65],[133,0]]},
  25:{title:'Ножницы над каналом',speed:58,
    routeDecks:[[30,45,0,-1,0,0,10],[45,59,-1,-4.05,0,2.8,7],
      [65,86,-5.3,-5.1,1.05,1.05,5.6],[86,100,-5.1,-.7,1.05,3.95,6.4],
      [106,125,1.3,3.05,1.35,1.35,5.4],[125,140,3.05,0,1.35,0,9],
      [140,154,0,0,0,0,14]],
    line:[[42,-1],[57,-3.7],[71,-5.25],[84,-5.2],[100,-.6],[114,2.2],[126,2.7],[144,0]]},
  27:{title:'Свайный мост',speed:35,
    routeDecks:[[30,49,0,0,0,2.6,8],[49,64,0,-3.5,2.6,2.6,5.95],
      [64,81,-3.5,-3.5,2.6,2.6,4.45],[81,97,-3.5,2.65,2.6,3.15,5.4],
      [101,116,4.1,4.1,1.95,1.95,5.45],[116,139,4.1,0,1.95,0,7],
      [139,154,0,0,0,0,14]],
    line:[[47,0],[63,-3.5],[79,-3.5],[96,2.4],[104,4.1],[115,4.1],[139,0]]},
  29:{title:'Диспетчерские пути',speed:48,branch:['ЛЕВО · МОСТ','ПРАВО · ПРЫЖОК'],
    routeDecks:[[30,45,0,0,0,0,26],
      [45,63,-6,-6,0,2.8,6.8],[63,103,-6,-6,2.8,2.8,4.45],[103,130,-6,0,2.8,0,7],
      [45,56,6,6,0,0,6.8],[56,71,6,7,0,3.5,6.35],[82,103,8.1,7.5,1.25,1.25,5.55],
      [103,130,7.5,0,1.25,0,7],[130,154,0,0,0,0,14]],
    line:[[30,0],[46,-6],[104,-6],[131,0],[146,0]],
    alternate:{speed:72,line:[[30,0],[46,6],[70,6.9],[88,7.9],[102,7.5],[132,0],[146,0]]}},
  30:{title:'Финиш над кораблём',speed:81,
    routeDecks:[[30,51,0,0,0,0,14],[51,74,0,4.15,0,5.45,8],
      [90,115,7.2,10,1.45,1.45,5.75],[115,137,10,0,1.45,0,9],[137,154,0,0,0,0,14]],
    line:[[44,0],[61,2],[75,4.25],[94,7.75],[116,9.5],[138,0]]},
};
for (const [number,layout] of Object.entries(rebuilt)) {
  const {x} = sections[number-1];
  sections[number-1] = {x,...layout};
}

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
    if (section.routeDecks) {
      for (const [from,to,x0,x1,y0,y1,w,surface] of section.routeDecks) {
        decks.push({x:x+x0,x1:x+x1,a:z+from,b:z+to,w,y0,y1,surface});
      }
      return {...section,z,previous,decks,gate:PORT_GATES[index]};
    }
    const features = [
      ...(section.jumps ?? []).map(([from,lip,gap,low,high,landing,width])=>({from,to:lip,low,high,width,gap,landing})),
      ...(section.hills ?? []).map(([from,to,low,high,width=DECK,offset=0])=>({from,to,low,high,width,offset})),
      ...(section.down ? [{from:section.down[0],to:section.down[1],low:section.down[2],high:0,width:DECK}] : []),
      ...(section.narrow ?? []).map(([from,to,width,offset=0])=>({from,to,width,offset})),
    ].sort((a,b)=>a.from-b.from);
    let last = 30, height = 0;
    const deck = (a,b,w,y0,y1,offset=0)=>decks.push({x:x+offset,a:z+a,b:z+b,w,y0,y1});
    for (const feature of features) {
      if (feature.from>last) deck(last,feature.from,DECK,height,height);
      deck(feature.from,feature.to,feature.width,feature.low ?? height,feature.high ?? height,feature.offset);
      last = feature.to+(feature.gap ?? 0);
      height = feature.landing ?? feature.high ?? height;
    }
    if (last<SPAN) deck(last,SPAN,DECK,height,height);
    return {...section,z,previous,decks,gate:PORT_GATES[index]};
  });
}
export const PORT_SECTORS = pierSections();

export function portLayout() {
  const vector = ({x,z})=>new THREE.Vector3(x,0,z);
  const road = [vector(PORT_SPAWN)];
  const branches = [];
  for (const sector of PORT_SECTORS) {
    const centerline = points=>(points ?? []).map(([z,x])=>vector({x:sector.x+x,z:sector.z+z}));
    road.push(vector({x:sector.x,z:sector.z+29}),...centerline(sector.line),vector(sector.gate));
    if (sector.alternate) branches.push(centerline(sector.alternate.line));
  }
  const direction = new THREE.Vector3(0,0,1);
  return {port:true,arena,spawn:PORT_SPAWN,road,branches,gates:PORT_GATES.map(gate=>({
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
  const obstacles = [], visualHazards = [];
  const hazards = portHazards(PORT_SECTORS);
  const harbor = harborScenery();
  const material = color=>new THREE.MeshStandardMaterial({color,roughness:.84});
  const steel=material(0x525d65), deck=material(0x70797d), yellow=material(0xf6bc50);
  const ink=material(0x222f36), aqua=material(0x287d82), rust=material(0xa55838), light=material(0xf2ead4);
  const scenery = dockMaterials();
  const waterLength=END-START+320;
  scenery.water.repeat.set(440/17,waterLength/18);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(440,waterLength),
    new THREE.MeshBasicMaterial({color:0xe6f0ef,map:scenery.water}));
  water.rotation.x=-Math.PI/2;
  water.position.set(0,HARBOR_WATER,arena.z);
  group.add(water);
  const chunks = [], cameraShapes = [];
  let visibleFirst=-1,visibleLast=-1;

  PORT_SECTORS.forEach((section,index)=>{
    const chunk = new THREE.Group();
    chunks.push(chunk);
    const sectionObstacles = [];
    cameraShapes.push(sectionObstacles);
    group.add(chunk);
    const block=(x,y,z,w,h,d,paint,pitch=0,yaw=0)=>{
      const mesh=box(chunk,[w,h,d],[x,y,z],paint,[pitch,yaw,0,'YXZ']);
      mesh.castShadow=false;
      return mesh;
    };
    function structure(x,y,z,w,h,d,paint,pitch=0,drivable=false,yaw=0) {
      const mesh=block(x,y,z,w,h,d,paint,pitch,yaw);
      const shape = {x,y:y-h/2,z,w,h,d,pitch,yaw,drivable};
      obstacles.push(shape);
      if (!drivable) sectionObstacles.push(shape);
      return mesh;
    }
    const deckTops = [];
    for (const {x,x1=x,a,b,w,y0,y1,surface} of section.decks) {
      const dx=x1-x,dz=b-a,dy=y1-y0;
      const yaw=Math.atan2(dx,dz), pitch=-Math.atan2(dy,Math.hypot(dx,dz)), depth=Math.hypot(dx,dz,dy);
      const cx=(x+x1)/2, cy=(y0+y1)/2, cz=(a+b)/2;
      const normalX=Math.sin(yaw)*Math.sin(pitch),normalZ=Math.cos(yaw)*Math.sin(pitch);
      const paint=surface==='barge' || surface==='containers' ? steel : deck;
      structure(cx-.45*normalX,cy-.45*Math.cos(pitch),cz-.45*normalZ,w,.9,depth,paint,pitch,true,yaw);
      const top = new THREE.PlaneGeometry(w,depth);
      top.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2)));
      top.translate(cx+.012*normalX,cy+.012*Math.cos(pitch),cz+.012*normalZ);
      const uv = top.getAttribute('uv');
      for (let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w,uv.getY(i)*depth);
      deckTops.push(top);
      for (const side of [-1,1]) {
        const edge=side*(w/2-.14);
        block(cx+Math.cos(yaw)*edge,cy+.023,cz-Math.sin(yaw)*edge,.14,.018,depth,yellow,pitch,yaw);
      }
      if (pitch<-.09) for (let k=1;k<=3;k++) {
        const t=k/4;
        block(x+dx*t,y0+dy*t+.025,a+dz*t,w-.4,.025,.26,k%2 ? yellow : ink,pitch,yaw);
      }
    }

    const topMesh = new THREE.Mesh(mergeGeometries(deckTops),scenery.deck);
    topMesh.receiveShadow=true;
    deckTops.forEach(geometry=>geometry.dispose());
    chunk.add(topMesh);
    addDockScenery(block,section,index,scenery);
    chunk.add(harbor.createChunk(section,index));
    for (const hazard of hazards) {
      if (hazard.z<section.z || hazard.z>=section.z+SPAN) continue;
      const visual=buildPortHazard(chunk,world,hazard,{steel,ink,rust,yellow,light});
      batchSharedMeshes(visual.body);
      visualHazards.push(visual);
      obstacles.push({...hazard,motion:time=>portHazardPose(hazard,time)});
    }

    for (const [along,side,offset=3.25,width=7,floor=0] of section.slalom ?? []) {
      const x=section.x+side*offset,z=section.z+along;
      structure(x,floor+.82,z,width,1.64,3.3,index%2 ? rust : aqua);
      for (let j=0;j<7;j++) block(x+(j-3)*width/7,floor+.64,z-1.67,width/13,.32,.03,j%2?ink:yellow);
    }

    for (const [along,floor,width,clearance] of section.arches ?? []) {
      const z = section.z+along, x = section.x;
      for (const side of [-1,1]) structure(x+side*(width*.5+.18),floor+clearance*.5,z,.27,clearance,.38,steel);
      structure(x,floor+clearance+.17,z,width+.7,.34,.52,yellow);
    }

    for (const [,lip,gap,,height,,width] of section.jumps ?? []) {
      for (let i=0;i<6;i++) {
        block(section.x+(i-2.5)*(width-.18)/6,height-.09,section.z+lip-.47,
          (width-.18)/6,.025,.24,i%2 ? ink : yellow);
      }
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
    textPlane(chunk,finish ? 'ФИНИШ' : `${String(index+1).padStart(2,'0')} / ${PORT_GATES.length}`,
      5.5,.57,[x,y+3.29,z-.19],[0,Math.PI,0],'#fff5d9','#263b44');
    textPlane(chunk,section.title.toUpperCase()+` · ${section.speed} КМ/Ч`,12,.62,
      [(section.previous+section.x)/2,3.8,section.z+22],[0,Math.PI,0],'#ffe6a7','#263b44');
    if (section.branch) for (const [lane,label] of section.branch.entries()) {
      textPlane(chunk,label,7.4,.59,[section.x+(lane ? 6 : -6),2.85,section.z+37],
        [0,Math.PI,0],'#ffe6a7','#263b44');
    }
    if (finish) structure(x,.7,END-.5,DECK,1.4,.55,steel);
    batchSharedMeshes(chunk);
  });

  const cameraBuckets = cameraShapes.map((_,i)=>cameraShapes.slice(Math.max(0,i-1),i+2).flat());
  return {
    group,obstacles,fx:createTireEffects(group),markGate() {},
    animate(now,time) {
      scenery.water.offset.set((now*.000035)%1,(now*.000061)%1);
      for (const {hazard,body,amber} of visualHazards) {
        if (!body.parent.visible) continue;
        const {x,y,z}=portHazardPose(hazard,time);
        body.position.set(x,y,z);
        const [state]=portSignal(hazard,time);
        amber.color.setHex(state==='open' ? 0x79fa95 : state==='opening' || state==='closing' ? 0xffc555 : 0xff5942);
      }
    },
    signalNear(z,time) {
      const hazard=hazards.find(item=>item.z-z>=-2.7 && item.z-z<=36);
      if (!hazard) return null;
      const [state,remaining]=portSignal(hazard,time);
      return {state,remaining,distance:Math.max(0,hazard.z-z)};
    },
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
