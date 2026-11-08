import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { WHEEL_X, WHEEL_Z } from './vehicle.js';

export async function fitE39(world) {
  const { car, engine, box, mats } = world;
  const draco = new DRACOLoader().setDecoderPath('./vendor/draco/').setWorkerLimit(2);
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('./assets/bmw/e39.glb')
    .finally(() => draco.dispose());
  for (const child of [...car.children]) if (child !== engine) child.removeFromParent();
  engine.position.y = .47;
  engine.visible = false;
  const shell = gltf.scene;
  shell.position.y = .205;
  car.add(shell);

  const moving = new Map();
  shell.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = !mesh.material.transparent;
    mesh.receiveShadow = true;
    const part = mesh.userData.garagePart;
    if (part) {
      if (!moving.has(part)) moving.set(part, []);
      moving.get(part).push(mesh);
    }
    if (mesh.material.name === 'window') {
      mesh.material.transparent = true;
      mesh.material.opacity = .46;
      mesh.material.depthWrite = false;
    }
  });

  function pivot(part, x, y, z, parent = car) {
    const group = new THREE.Group();
    group.position.set(x,y,z);
    parent.add(group);
    for (const mesh of moving.get(part) ?? []) group.attach(mesh);
    return group;
  }

  const hood = pivot('hood', 0, .984, -.985);
  const trunk = pivot('trunk', 0, 1.069, 1.766);
  const carDoors = {
    left: pivot('left', -.84, .80, -.866),
    right: pivot('right', .84, .80, -.866),
  };
  const steering = pivot('steering', -.382, .933, -.407);
  const hubs = [];
  const wheels = WHEEL_Z.map((z, i) => {
    const hub = pivot('hub'+i,WHEEL_X[i], .36,z);
    hubs.push(hub);
    return pivot('wheel'+i, 0, 0, 0, hub);
  });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0x292d2e, roughness: 1 });
  box(car, [1.24,.06,.68], [0,.55,1.89], upholstery);
  box(car, [1.20,.22,.045], [0,.65,1.56], upholstery);
  box(car, [.24,.16,.31], [.545,.64,1.92], mats.black);
  for (const [z,mat] of [[1.82,mats.red],[2.02,mats.metal]]) box(car,[.048,.028,.047],[.545,.735,z],mat);
  world.textPlane(car, '12 V', .15, .06, [.545,.725,1.92], [-Math.PI/2,0,0], '#f0bd78');

  const brakeLamps = new THREE.MeshStandardMaterial({
    color: 0x8c1209, emissive: 0xf72814, emissiveIntensity: 0, transparent: true, opacity: .78,
  });
  const lampMeshes = [-1,1].map(side => box(car,[.23,.057,.012],[side*.576,.817,2.265],brakeLamps));
  for (const lamp of lampMeshes) lamp.visible = false;
  const paints = new Set();
  shell.traverse(o => { if (o.isMesh && o.material.name === 'body') paints.add(o.material); });
  // Some paint parts were moved out of the source hierarchy to their hinges.
  for (const panel of [hood,trunk,...Object.values(carDoors)]) panel.traverse(o => {
    if (o.isMesh && o.material.name === 'body') paints.add(o.material);
  });
  return { hood,trunk,carDoors,wheels,hubs,steering, paints, brakeLamps, lampMeshes };
}
