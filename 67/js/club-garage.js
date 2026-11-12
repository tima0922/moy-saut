import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchSharedMeshes } from './garage-visuals.js';

export const CLUB_FLOOR = { x: 0, z: -56, w: 28, d: 20 };
export const STALLS = { sedan: -9, f90: -3, cls: 3, supra: 9 };
const STALL_NAMES = { sedan:'M5 E39',f90:'M5 F90',cls:'CLS C219',supra:'SUPRA A80' };
export const STALL_Z = -58;
export const SERVICE_STEPS = {
  brakes: ['Поднять машину', 'Снять переднее колесо', 'Заменить колодки', 'Установить колесо', 'Опустить машину'],
  tires: ['Поднять машину', 'Снять колесо', 'Поставить колесо с новой шиной', 'Опустить машину'],
  battery: ['Открыть багажник', 'Поднять лючок', 'Заменить аккумулятор', 'Закрыть багажник'],
  body: ['Открыть капот', 'Выправить крепления передней панели', 'Закрыть капот'],
};

export function createClubGarage(world) {
  const { scene, box, textPlane, mats, floor } = world;
  const room = new THREE.Group();
  scene.add(room);
  const walls = new THREE.MeshStandardMaterial({ color: 0x46515b, roughness: .87 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x212932, roughness: .89, metalness: .16 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xdb9f48, roughness: .72 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x283038, roughness: .92 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x93b4c4, roughness: .37,
    emissive: 0x465c6a, emissiveIntensity: .45 });
  const obstacles = [];
  function solid(x, z, width, depth, height, material) {
    box(room,[width,height,depth],[x,height/2,z],material);
    obstacles.push({ x, z, w: width, d: depth, h: height });
  }
  solid(0,-65.9,28,.23,5.7,walls);
  solid(0,-46.1,28,.23,5.7,walls);
  for (const x of [-13.9,13.9]) solid(x,-56,.23,19.8,5.7,walls);
  box(room,[28,.21,20],[0,5.7,-56],charcoal);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(28,20),floor.material.clone());
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0,-.01,-56);
  surface.receiveShadow = true;
  room.add(surface);

  for (const z of [-63.3,-56.6,-49.7]) {
    box(room,[28,.32,.27],[0,5.35,z],charcoal);
    for (const x of [-9,-3,3,9]) box(room,[4.2,.055,.24],[x,5.18,z],mats.light);
  }
  for (const x of [-9,-3,3,9]) box(room,[4.1,1.05,.045],[x,4.32,-65.73],glass);
  for (const [index, [id, x]] of Object.entries(STALLS).entries()) {
    box(room,[4.9,.018,7.4],[x,.003,STALL_Z],pad).castShadow = false;
    for (const side of [-1,1]) {
      const px = x + side * 2.38;
      box(room,[.077,.016,7.4],[px,.018,STALL_Z],paint).castShadow = false;
      solid(px,STALL_Z+.38,.28,.38,3.07,charcoal);
      box(room,[.31,.81,.402],[px,.62,STALL_Z+.38],paint);
    }
    box(room,[4.8,.016,.08],[x,.018,STALL_Z+3.69],paint).castShadow = false;
    textPlane(room,`0${index + 1}   /   ${STALL_NAMES[id]}`,
      4.5,.6,[x,3.47,-65.69],[0,0,0],'#e9ded0','#202c35');
  }
  for (const x of [-8,0,8]) {
    box(room,[5.3,2.65,.18],[x,1.48,-46.28],charcoal);
    for (let y=.23;y<2.8;y+=.18) box(room,[5.2,.036,.04],[x,y,-46.40],walls).castShadow = false;
  }
  textPlane(room,'GARAGE LIFE   /   CIRCUIT 67',9,.64,[0,3.91,-46.42],[0,Math.PI,0],'#ffd299');

  const liftArms = new THREE.Group();
  room.add(liftArms);
  for (const side of [-1,1]) for (const offset of [-1,1]) {
    box(liftArms,[1.56,.13,.17],[side*1.52,0,offset*.92],mats.orange,[0,offset*side*.29,0]);
  }
  liftArms.visible = false;

  const furniture = [
    { match: 'workbench-with-vice', x: -7, z: -64.6, w: 3.3, d: 1.1, h: 1.65 },
    { match: 'parts-shelving-stocked', x: 0, z: -64.7, w: 3.1, d: .95, h: 2.9 },
    { match: 'tool-chest', x: 7, z: -64.6, w: 2.4, d: .95, h: 1.55 },
    { match: 'compressor', x: 11.6, z: -64.5, w: 1.6, d: .95, h: 1.2 },
  ];
  for (const prop of furniture) obstacles.push(prop);
  const equipment = new GLTFLoader().loadAsync('./assets/club/workshop.glb').then(({scene: source}) => {
    source.updateMatrixWorld(true);
    const allMeshes = [];
    source.traverse(mesh => { if (mesh.isMesh && !Array.isArray(mesh.material)) allMeshes.push(mesh); });
    let installed = 0;
    for (const slot of furniture) {
      const meshes = allMeshes.filter(mesh => (mesh.name + ' ' + mesh.parent.name).includes(slot.match));
      if (!meshes.length) continue;
      const materials = new Map();
      const bounds = new THREE.Box3();
      for (const mesh of meshes) {
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
        if (!materials.has(mesh.material)) materials.set(mesh.material, []);
        materials.get(mesh.material).push(geometry);
      }
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min(slot.w / size.x, slot.d / size.z, slot.h / size.y);
      for (const [material, geometries] of materials) {
        const merged = mergeGeometries(geometries.map(g => g.index ? g.toNonIndexed() : g));
        if (!merged) continue;
        merged.translate(-center.x, -bounds.min.y, -center.z);
        const prop = new THREE.Mesh(merged, material);
        prop.scale.setScalar(scale);
        prop.position.set(slot.x,.013,slot.z);
        prop.receiveShadow = true;
        room.add(prop);
      }
      installed++;
    }
    return installed > 0;
  }).catch(error => {
    console.warn('Workshop furniture could not load', error);
    return false;
  });
  const lighting = new THREE.Group();
  for (const x of [-8,0,8]) {
    const lamp = new THREE.PointLight(0xe0ebff,45,12,1.7);
    lamp.position.set(x,4.9,STALL_Z);
    lighting.add(lamp);
  }
  room.add(lighting);
  batchSharedMeshes(room);
  return { room, obstacles, liftArms, equipment };
}
