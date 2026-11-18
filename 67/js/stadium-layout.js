import * as THREE from 'three';

export const STADIUM = {x:0,z:-340,w:528,d:252};
export const RADIUS = 76;
export const HALF_WIDTH = 10;
export const OVAL_LENGTH = 3 * 2 * Math.PI * 55;
const TURN_LENGTH = Math.PI * RADIUS;
const STRAIGHT = (OVAL_LENGTH - 2 * TURN_LENGTH) / 2;
const HALF_STRAIGHT = STRAIGHT / 2;
const START_OFFSET = 55;
const COUNT = 320;
export const INFIELD_HALF = 6;
const INFIELD_AMPLITUDE = 16;

export function ovalPoint(meters, offset = 0) {
  const t = THREE.MathUtils.euclideanModulo(meters + START_OFFSET, OVAL_LENGTH);
  const r = RADIUS + offset;
  if (t < STRAIGHT) return {x:t-HALF_STRAIGHT,z:STADIUM.z-r,tx:1,tz:0};
  if (t < STRAIGHT + TURN_LENGTH) {
    const a = (t-STRAIGHT) / RADIUS - Math.PI / 2;
    return {x:HALF_STRAIGHT+r*Math.cos(a),z:STADIUM.z+r*Math.sin(a),tx:-Math.sin(a),tz:Math.cos(a)};
  }
  if (t < 2*STRAIGHT + TURN_LENGTH) return {x:HALF_STRAIGHT-(t-STRAIGHT-TURN_LENGTH),z:STADIUM.z+r,tx:-1,tz:0};
  const a = (t-2*STRAIGHT-TURN_LENGTH) / RADIUS + Math.PI / 2;
  return {x:-HALF_STRAIGHT+r*Math.cos(a),z:STADIUM.z+r*Math.sin(a),tx:-Math.sin(a),tz:Math.cos(a)};
}

export function ovalSample(x,z) {
  const localZ = z - STADIUM.z;
  const dx = x - THREE.MathUtils.clamp(x,-HALF_STRAIGHT,HALF_STRAIGHT);
  const distance = Math.hypot(dx,localZ);
  const onRoad = Math.abs(distance-RADIUS) <= HALF_WIDTH;
  const tangentX = -localZ / (distance || 1), tangentZ = dx / (distance || 1);
  let meters;
  if (dx > 0) meters = STRAIGHT + RADIUS * (Math.atan2(localZ,dx) + Math.PI/2);
  else if (dx < 0) {
    const angle = Math.atan2(-localZ,-dx);
    meters = 2*STRAIGHT + TURN_LENGTH + RADIUS * (angle + Math.PI/2);
  } else meters = localZ < 0 ? x + HALF_STRAIGHT : STRAIGHT + TURN_LENGTH + HALF_STRAIGHT - x;
  return {onRoad,tangentX,tangentZ,meters:THREE.MathUtils.euclideanModulo(meters-START_OFFSET,OVAL_LENGTH)};
}

export function infieldX(z) {
  const progress = (z-STADIUM.z) / RADIUS;
  return INFIELD_AMPLITUDE * Math.sin(Math.PI * progress);
}

function entranceOffset(z) {
  const slope = INFIELD_AMPLITUDE * Math.PI / RADIUS * Math.cos(Math.PI*(z-STADIUM.z)/RADIUS);
  return Math.hypot(1,slope);
}

export function stadiumSurface(x,z) {
  const localZ = z - STADIUM.z;
  const dx = Math.max(0,Math.abs(x)-HALF_STRAIGHT);
  if (Math.abs(Math.hypot(dx,localZ)-RADIUS) <= HALF_WIDTH + .6) return 1;
  return Math.abs(localZ) <= RADIUS && Math.abs(x-infieldX(z)) <= (INFIELD_HALF+.25)*entranceOffset(z) ? 1 : .62;
}

export function infieldPoint(z, offset = 0) {
  return {x:infieldX(z) + offset*entranceOffset(z),z};
}

export function createStadiumLayout() {
  const road = [], directions = [];
  for (let i=0; i<COUNT; i++) {
    const {x,z,tx,tz} = ovalPoint(i * OVAL_LENGTH/COUNT);
    road.push(new THREE.Vector3(x,0,z));
    directions.push(new THREE.Vector3(tx,0,tz));
  }
  const gates = [80,160,240,0].map(index => ({position:road[index],direction:directions[index],half:HALF_WIDTH}));
  const connector = Array.from({length:49},(_,i)=>infieldPoint(STADIUM.z-RADIUS + 2*RADIUS*i/48));
  const mapViewBox = [-STADIUM.w/2,-STADIUM.z-STADIUM.d/2,STADIUM.w,STADIUM.d].join(' ');
  return {id:'stadium',stadium:true,road,directions,gates,connector,arena:STADIUM,mapViewBox,widths:road.map(()=>HALF_WIDTH),
    spawn:{x:road[0].x,z:road[0].z,yaw:-Math.PI/2}};
}
