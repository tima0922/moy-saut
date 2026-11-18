import * as THREE from 'three';

export const RADIUS = 90;
export const HALF_WIDTH = 10;
export const RING_LENGTH = 2 * Math.PI * RADIUS;
const SIZE = 2 * (RADIUS + 47);
export const STADIUM = {x:0,z:-340,w:SIZE,d:SIZE};
export const INFIELD_HALF = 6;
const INFIELD_AMPLITUDE = 16;
const COUNT = 320;

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

function infieldWidthFactor(z) {
  const slope = INFIELD_AMPLITUDE * Math.PI / RADIUS * Math.cos(Math.PI*(z-STADIUM.z)/RADIUS);
  return Math.hypot(1,slope);
}

export function stadiumSurface(x,z) {
  const dx = x - STADIUM.x, dz = z - STADIUM.z;
  if (Math.abs(Math.hypot(dx,dz)-RADIUS) <= HALF_WIDTH + .6) return 1;
  return Math.abs(dz) <= RADIUS && Math.abs(dx-infieldCenter(z)) <= (INFIELD_HALF+.25)*infieldWidthFactor(z) ? 1 : .62;
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
