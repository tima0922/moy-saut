import * as THREE from 'three';
import { batchSharedMeshes } from './garage-visuals.js';
import { createTireEffects } from './drift-world.js?v=024';

// Eastbound boulevard, the quay, then the station chicane leading back to the grid.
const knots=[
  [-30,478],[23,478],[72,478],[98,485],[105,507],[105,553],[104,613],
  [94,649],[68,660],[45,650],[33,625],[12,618],[-8,631],[-28,660],
  [-59,663],[-77,649],[-79,618],[-100,600],[-111,581],[-109,550],
  [-84,538],[-65,523],[-70,504],[-67,488]
];
export function createCityLayout() {
  const curve=new THREE.CatmullRomCurve3(knots.map(([x,z])=>new THREE.Vector3(x,0,z)),true);
  curve.arcLengthDivisions=1800;
  const count=384;
  const road=curve.getSpacedPoints(count).slice(0,-1);
  const directions=road.map((_,i)=>road[(i+1)%count].clone().sub(road[(i+count-1)%count]).normalize());
  // Use measured heading change over about one braking zone, then keep one apex per corner.
  const bend=directions.map((_,i)=>{
    const a=directions[(i+count-5)%count],b=directions[(i+5)%count];
    return Math.atan2(a.z*b.x-a.x*b.z,a.dot(b));
  });
  const corners=[];
  for(const {angle,i} of bend.map((angle,i)=>({angle,i})).sort((a,b)=>Math.abs(b.angle)-Math.abs(a.angle))){
    if(Math.abs(angle)<.38)break;
    if(corners.some(c=>Math.min(Math.abs(c.i-i),count-Math.abs(c.i-i))<15))continue;
    corners.push({i,angle});
  }
  corners.sort((a,b)=>a.i-b.i);
  return {city:true,id:'city',road,directions,corners,arena:{x:0,z:570,w:284,d:235},
    gates:[96,192,288,0].map(i=>({position:road[i],direction:directions[i]})),
    spawn:{x:road[0].x,z:road[0].z,yaw:-Math.PI/2}};
}

function facade(style) {
  const c=document.createElement('canvas');
  c.width=128;c.height=256;
  const ctx=c.getContext('2d');
  const palettes=[
    ['#354354','#475968','#7495a5','#f2c995','#253345'],
    ['#865f53','#674f4f','#a3aab1','#ffd496','#443b41'],
    ['#47525e','#677483','#abc3c8','#eee2a2','#313f53'],
  ];
  const [wall,frame,glass,warm,dark]=palettes[style];
  ctx.fillStyle=wall;ctx.fillRect(0,0,128,256);
  for(let y=0;y<12;y++) for(let x=0;x<6;x++) {
    const roll=(x*31+y*17+x*y*11+style*3)%13;
    const px=2+x*21,py=4+y*21;
    ctx.fillStyle=frame;
    ctx.fillRect(px,py,18,16);
    ctx.fillStyle=roll<3?warm:roll<8?glass:dark;
    ctx.fillRect(px+2,py+2,14,11);
    ctx.fillStyle=wall;ctx.fillRect(px+9,py+2,1,11);
    if(style===1){ctx.fillStyle='#b89b84';ctx.fillRect(px-1,py+15,20,2);}
  }
  const map=new THREE.CanvasTexture(c);
  map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({map});
}

// The same bevel-free road cross section supplies pavement, paint and sidewalks.
function ribbon(layout,left,right,y,paint) {
  const xyz=[],uv=[],indices=[];
  let length=0;
  for(let i=0;i<=layout.road.length;i++) {
    const index=i%layout.road.length,p=layout.road[index],d=layout.directions[index];
    if(i) length+=layout.road[(i-1)%layout.road.length].distanceTo(p);
    for(const side of [left,right]){
      xyz.push(p.x+d.z*side,y,p.z-d.x*side);
      uv.push(side/7,length/7);
    }
    if(i){const a=2*i-2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,paint);mesh.receiveShadow=true;return mesh;
}

export function createCityWorld(world,layout,asphaltSource) {
  const group=new THREE.Group(),props=new THREE.Group();
  group.add(props);
  const obstacles=[{x:0,z:570,w:310,d:260,y:-.8,h:.8,drivable:true}];
  const matte=color=>new THREE.MeshLambertMaterial({color});
  const lit=color=>new THREE.MeshBasicMaterial({color});
  const stone=matte(0x879298), steel=matte(0x374659),metal=matte(0x617080);
  const yellow=lit(0xe7b36a), chalk=matte(0xe5e6dc),ink=matte(0x253546);
  const aqua=lit(0x81d6d5),amber=lit(0xffc783);
  const paints=[0,1,2].map(facade);
  const box=(x,y,z,w,h,d,paint,yaw=0,solid=false)=>{
    const mesh=world.box(props,[w,h,d],[x,y,z],paint,[0,yaw,0]);
    mesh.castShadow=false;
    if(solid)obstacles.push({x,z,w,h,d,y:y-h/2,yaw});
    return mesh;
  };
  const road=asphaltSource.clone();
  road.color.setHex(0x808c9b);road.map=asphaltSource.map.clone();road.map.repeat.set(1,1);
  group.add(ribbon(layout,-11,11,.018,stone),ribbon(layout,-8.3,8.3,.031,road));
  for(const side of [-1,1]){
    const s=side*7.82;group.add(ribbon(layout,s-.075,s+.075,.043,chalk));
  }
  const ground=matte(0x657374),water=matte(0x446e84);
  box(-37,-.24,574,330,.46,283,ground);
  box(151,-.30,568,46,.5,310,water);
  box(128,.28,572,.55,.7,275,stone,0,true);
  const distanceToRoad=(x,z)=>Math.sqrt(layout.road.reduce((best,p)=>Math.min(best,(p.x-x)**2+(p.z-z)**2),Infinity));
  function located(i,offset) {
    const p=layout.road[i],d=layout.directions[i];
    return {x:p.x+d.z*offset,z:p.z-d.x*offset,yaw:Math.atan2(d.x,d.z)};
  }
  for(let i=0;i<layout.road.length;i+=4){
    const p=located(i,0);
    box(p.x,.047,p.z,.16,.012,2.8,chalk,p.yaw);
    if(i%16)continue;
    const side=i%32?1:-1;
    const s=located(i,side*9.7),d=layout.directions[i];
    box(s.x,2.55,s.z,.15,5.1,.15,steel,s.yaw,true);
    box(s.x-d.z*side*.57,5.05,s.z+d.x*side*.57,1.28,.13,.21,steel,s.yaw);
    box(s.x-d.z*side*1.07,4.99,s.z+d.x*side*1.07,.65,.09,.30,amber,s.yaw);
  }
  // Plot sizes are checked against the complete road before placing any building.
  // Secondary streets continue past the painted circuit at the intersections.
  for(let x=-148;x<120;x+=24) box(x,-.013,574,4.4,.035,275,ink);
  for(let z=453.5;z<709;z+=25) box(-18,-.013,z,283,.038,4.4,ink);
  for(const i of [25,91,191,306]){
    for(let stripe=-6;stripe<=6;stripe+=1.2){
      const p=located(i,stripe);
      box(p.x,.052,p.z,.52,.012,2.45,chalk,p.yaw);
    }
  }
  let serial=0;
  for(let z=441;z<=711;z+=25) for(let x=-160;x<=124;x+=24){
    const n=++serial, w=13+(n*5)%6,d=13+n*7%6;
    if(distanceToRoad(x,z)<Math.hypot(w,d)/2+11.8 || Math.abs(z-565)<9)continue;
    const market=z>600 && x<54, type=market?1:n%3;
    const h=market?8+(n*13)%9:14+(n*19)%34;
    box(x,h/2,z,w,h,d,paints[type],0,true);
    box(x,h+.13,z,w+.56,.26,d+.56,metal);
    box(x+1,h+1.05,z-1,w*.46,1.85,d*.49,steel);
    if(!market && n%4===0){
      box(x,h+2.4,z,w*.65,4.6,d*.65,paints[type]);
      box(x,h+4.7,z,w*.68,.24,d*.68,aqua);
    }
    if(market)box(x,3.1,z+d/2+.35,w*.87,.32,1.25,n%2?amber:aqua);
  }
  // A raised railway crosses two parts of the circuit; pillars only occupy safe plots.
  box(0,8.0,565,300,1.05,6.3,metal);
  for(const z of [562,568])box(0,8.8,z,300,.64,.20,steel);
  for(let x=-143;x<140;x+=22) if(distanceToRoad(x,565)>11.8){
    box(x,3.75,565,1.55,7.5,2.3,stone,0,true);
    box(x,7.3,565,2.9,.66,5,stone);
  }
  for(let x=-45;x<=35;x+=10){
    box(x,10.05,565,9.6,2.83,3.15,chalk);
    box(x,10.35,566.59,8.75,.89,.09,ink);
    box(x,10.35,563.41,8.75,.89,.09,ink);
    box(x,9.21,565,9.65,.35,3.25,aqua);
  }
  for(const corner of layout.corners){
    const i=(corner.i+layout.road.length-5)%layout.road.length;
    const side=Math.sign(corner.angle);
    const s=located(i,-side*10.8);
    box(s.x,1.47,s.z,2.45,.95,.16,ink,s.yaw,true);
    world.textPlane(props,side>0?'❮ ❮':'❯ ❯',2.35,.85,
      [s.x-.095*Math.sin(s.yaw),1.48,s.z-.095*Math.cos(s.yaw)],[0,s.yaw+Math.PI,0],'#ffcb77','#253443');
  }
  // Quay rail with continuous collision, ochre mooring bollards and ferry terminal.
  for(let z=486;z<=653;z+=6){
    box(119,.6,z,.22,1.2,.22,steel,0,true);
    if(z%12===6)box(125,.4,z,.8,.8,.86,yellow);
  }
  box(119,.95,570,.19,.16,172,metal,0,true);
  box(119,.46,570,.14,.13,172,metal);
  box(144,.3,547,10,1.8,32,ink);
  box(144,2.28,546,8.7,2.2,24,chalk);
  box(144,2.65,546,8.9,.85,21,steel);
  box(144,3.8,545,7.1,.5,19,chalk);
  batchSharedMeshes(props);
  const fx=createTireEffects(group);
  return {group,obstacles,fx,markGate(){}};
}
