import * as THREE from 'three';

export const RADIUS = 90;
export const HALF_WIDTH = 10;
export const RING_LENGTH = 2 * Math.PI * RADIUS;
const SIZE = 2 * (RADIUS + 47);
export const STADIUM = {x:0,z:-340,w:SIZE,d:SIZE};
export const INFIELD_HALF = 6;
const INFIELD_AMPLITUDE = 16;
const COUNT = 320;
const LINK_START = 3.89 * RADIUS;
const TOP_JOIN = 4.43 * RADIUS;
const BOTTOM_JOIN = 1.84 * RADIUS;
const LINK_HALF = 6.5;
const TOP_CENTER = -63;
const BOTTOM_CENTER = 62;

export function ringPoint(meters, offset = 0) {
  const angle = meters / RADIUS;
  const r = RADIUS + offset;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return {x:STADIUM.x+r*cos,z:STADIUM.z+r*sin,tx:-sin,tz:cos};
}

export function ringSample(x,z) {
  const dx = x - STADIUM.x, dz = z - STADIUM.z;
  const distance = Math.hypot(dx,dz);
  return {onRoad:Math.abs(distance-RADIUS)<=HALF_WIDTH,
    tangentX:-dz/(distance || 1),tangentZ:dx/(distance || 1),
    meters:THREE.MathUtils.euclideanModulo(Math.atan2(dz,dx)*RADIUS,RING_LENGTH)};
}

function infieldCenter(z) {
  return INFIELD_AMPLITUDE * Math.sin(Math.PI*(z-STADIUM.z)/RADIUS);
}

function infieldSlope(z) {
  return INFIELD_AMPLITUDE * Math.PI / RADIUS * Math.cos(Math.PI*(z-STADIUM.z)/RADIUS);
}

function infieldWidthFactor(z) {
  return Math.hypot(1,infieldSlope(z));
}

const top = ringPoint(TOP_JOIN), bottom = ringPoint(BOTTOM_JOIN);
const enter = STADIUM.z+TOP_CENTER, exit = STADIUM.z+BOTTOM_CENTER;
const node = (x,z) => new THREE.Vector3(x,0,z);
const from = point => node(point.x,point.z);
const junctions = [
  new THREE.CubicBezierCurve3(from(top),node(top.x+18*top.tx,top.z+18*top.tz),
    node(infieldCenter(enter)-14*infieldSlope(enter),enter-14),node(infieldCenter(enter),enter)),
  new THREE.CubicBezierCurve3(node(infieldCenter(exit),exit),node(infieldCenter(exit)+20*infieldSlope(exit),exit+20),
    node(bottom.x-21*bottom.tx,bottom.z-21*bottom.tz),from(bottom)),
];

export const stadiumJunctions = junctions.map(curve => (t,offset=0) => {
  const point = curve.getPoint(t), tangent = curve.getTangent(t);
  return {x:point.x+offset*tangent.z,z:point.z-offset*tangent.x};
});
const junctionCenters = stadiumJunctions.map(point => Array.from({length:25},(_,i)=>point(i/24)));

function onJunction(x,z) {
  if (Math.abs(z-STADIUM.z)<53 || Math.abs(x)>39) return false;
  const points = junctionCenters[Number(z>STADIUM.z)];
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    if ((x-a.x-t*dx)**2+(z-a.z-t*dz)**2<=LINK_HALF**2) return true;
  }
  return false;
}

export const STADIUM_JUNCTION_HALF = LINK_HALF;

export function stadiumSurface(x,z) {
  const dx = x - STADIUM.x, dz = z - STADIUM.z;
  if (Math.abs(Math.hypot(dx,dz)-RADIUS) <= HALF_WIDTH + .6) return 1;
  const infield = Math.abs(dz) <= RADIUS && Math.abs(dx-infieldCenter(z)) <= (INFIELD_HALF+.25)*infieldWidthFactor(z);
  return infield || onJunction(x,z) ? 1 : .62;
}

export function infieldPoint(z, offset = 0) {
  return {x:STADIUM.x+infieldCenter(z)+offset*infieldWidthFactor(z),z};
}

export function createStadiumLayout() {
  const road = [], directions = [];
  for (let i=0; i<COUNT; i++) {
    const {x,z,tx,tz} = ringPoint(i * RING_LENGTH/COUNT);
    road.push(new THREE.Vector3(x,0,z));
    directions.push(new THREE.Vector3(tx,0,tz));
  }
  const gates = [80,160,240,0].map(index => ({position:road[index],direction:directions[index],half:HALF_WIDTH}));
  const connector = Array.from({length:65},(_,i)=>infieldPoint(STADIUM.z-RADIUS + 2*RADIUS*i/64));
  const mapViewBox = [STADIUM.x-STADIUM.w/2,-STADIUM.z-STADIUM.d/2,STADIUM.w,STADIUM.d].join(' ');
  return {id:'stadium',stadium:true,road,directions,gates,connector,arena:STADIUM,mapViewBox,widths:road.map(()=>HALF_WIDTH),
    spawn:{x:road[0].x,z:road[0].z,yaw:Math.PI}};
}


export function createStadiumLinkLayout(base = createStadiumLayout()) {
  const road = [], widths = [];
  function section(point, start, end, steps, half) {
    for (let i=0;i<steps;i++) {
      road.push(from(point(THREE.MathUtils.lerp(start,end,i/steps))));
      widths.push(half);
    }
  }
  section(ringPoint,LINK_START,TOP_JOIN,30,HALF_WIDTH);
  section(stadiumJunctions[0],0,1,26,LINK_HALF);
  const middle = road.length;
  section(infieldPoint,enter,exit,79,INFIELD_HALF);
  section(stadiumJunctions[1],0,1,29,LINK_HALF);
  const returnToRing = road.length;
  section(ringPoint,BOTTOM_JOIN,LINK_START,109,HALF_WIDTH);
  const directions = road.map((_,i) => road[(i+1)%road.length].clone().sub(road[(i+road.length-1)%road.length]).normalize());
  const gate = (index, label, offset) => ({
    position:road[index], direction:directions[index], half:widths[index], label,
    ...(offset===undefined ? {} : {clip:{offset,width:1.65}}),
  });
  const gates = [gate(middle+11,'Вход в S-связку',3),gate(middle+66,'Выход из S-связки',-3),
    gate(returnToRing+27,'Возврат на кольцо'),gate(0,'Старт / финиш')];
  return {
    ...base, id:'stadium-s', stadiumLink:true, road, directions, widths, gates,
    spawn:{x:road[0].x,z:road[0].z,yaw:Math.atan2(-directions[0].x,-directions[0].z)},
  };
}
