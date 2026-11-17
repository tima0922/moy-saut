import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTireEffects } from './drift-world.js?v=022';
import { batchSharedMeshes } from './garage-visuals.js';

export const STADIUM = {x:0,z:373,w:162,d:162};
export const RADIUS = 55;
export const HALF_WIDTH = 7.8;
const count = 256;
const turn = Math.PI * 2;

export function createStadiumLayout() {
  const road = [], directions = [];
  for (let i=0; i<count; i++) {
    const angle = i * turn/count;
    road.push(new THREE.Vector3(STADIUM.x+RADIUS*Math.cos(angle),0,STADIUM.z+RADIUS*Math.sin(angle)));
    directions.push(new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle)));
  }
  const gates = [64,128,192,0].map(index => ({position:road[index],direction:directions[index]}));
  return {id:'stadium',stadium:true,road,directions,gates,arena:STADIUM,
    spawn:{x:road[0].x,z:road[0].z,yaw:Math.PI}};
}

export function stadiumSurface(x,z) {
  return Math.abs(Math.hypot(x-STADIUM.x,z-STADIUM.z)-RADIUS) <= HALF_WIDTH+.6 ? 1 : .62;
}

export function createStadiumWorld(world,asphaltSource) {
  const {x,z,w,d} = STADIUM;
  const group = new THREE.Group();
  world.scene.add(group);
  group.visible = false;
  const obstacles = [];
  const material = color => new THREE.MeshStandardMaterial({color,roughness:1});
  const grass = material(0x516a39), asphalt = material(0x767b82), runoff = material(0x6b6e6b);
  asphalt.map = asphaltSource.map.clone();
  asphalt.map.repeat.set(22,22);
  const red = material(0xba4835), white = material(0xe7e0ce), wall = material(0x575f65);
  const blue = material(0x315369);
  function surface(geometry, paint, y) {
    const mesh = new THREE.Mesh(geometry,paint);
    mesh.rotation.x = -Math.PI/2;
    mesh.position.set(x,y,z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  surface(new THREE.PlaneGeometry(w,d),grass,.004);
  const turf = material(0x587341);
  const stripes = [];
  const fieldR = RADIUS-HALF_WIDTH-2.5;
  for (let bx=-40;bx<=40;bx+=8) {
    const chord = 2*Math.sqrt(fieldR**2-(Math.abs(bx)+2)**2);
    stripes.push(new THREE.PlaneGeometry(4,chord).translate(bx,0,0));
  }
  surface(mergeGeometries(stripes),turf,.008);
  stripes.forEach(stripe => stripe.dispose());
  surface(new THREE.RingGeometry(RADIUS-HALF_WIDTH-2,RADIUS+HALF_WIDTH+5,count),runoff,.012);
  surface(new THREE.RingGeometry(RADIUS-HALF_WIDTH,RADIUS+HALF_WIDTH,count),asphalt,.019);
  for (const [parity,paint] of [white,red].entries()) {
    const strips = [];
    for (const edge of [RADIUS-HALF_WIDTH,RADIUS+HALF_WIDTH]) {
      for (let i=parity;i<64;i+=2) strips.push(new THREE.RingGeometry(edge-.27,edge+.27,4,1,i*turn/64,turn/64));
    }
    surface(mergeGeometries(strips),paint,.027);
    strips.forEach(strip => strip.dispose());
  }
  const railRadius = RADIUS+HALF_WIDTH+7;
  const railSides = 64;
  const railWidth = 2*railRadius*Math.tan(Math.PI/railSides);
  for (let i=0;i<railSides;i++) {
    const theta = i*turn/railSides;
    const bx=x+Math.cos(theta)*railRadius, bz=z+Math.sin(theta)*railRadius;
    const yaw = -theta-Math.PI/2;
    world.box(group,[railWidth,1.04,.52],[bx,.52,bz],wall,[0,yaw,0]).castShadow=false;
    obstacles.push({x:bx,z:bz,w:railWidth,d:.52,h:1.04,yaw});
  }
  for (let i=0;i<13;i++) {
    const bx = x+RADIUS-6+i;
    world.box(group,[.96,.01,1.1],[bx,.032,z],i%2 ? asphalt : white).castShadow=false;
  }
  for (const offset of [-35,0,35]) {
    for (let row=0;row<6;row++) {
      const bx=x+offset, bz=z+74+row*.96, h=.4+row*.46;
      world.box(group,[24,h,.94],[bx,h/2,bz],row%2 ? blue : wall).castShadow=false;
      obstacles.push({x:bx,z:bz,w:24,d:.94,h});
    }
  }
  world.box(group,[8,2.9,.24],[x+RADIUS+18,1.75,z-8],blue,[0,Math.PI,0]).castShadow=false;
  obstacles.push({x:x+RADIUS+18,z:z-8,w:8,d:.24,h:2.9,y:.30});
  world.textPlane(group,'СТАДИОН / ДРИФТ ПО КРУГУ',7.7,.63,[x+RADIUS+18,2.2,z-7.86],[0,0,0],'#fff3d8','#243744');
  batchSharedMeshes(group);
  return {group,obstacles,fx:createTireEffects(group),makeGuestEffects:() => createTireEffects(group),markGate() {}};
}
