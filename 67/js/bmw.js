import * as THREE from 'three';
import { windowTint } from './window-tint.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { WHEEL_X, WHEEL_Z } from './vehicle.js?v=013';

export const BATTERY = { x: 0, y: .69, z: 1.99 };

function buildS62(world) {
  const { engine, box, cylinder, textPlane, mats } = world;
  engine.clear();
  engine.position.set(0, .54, -1.43);
  engine.scale.setScalar(1);

  box(engine, [1.48, .055, 1.15], [0, -.11, 0], mats.dark);
  box(engine, [1.40, .20, .078], [0, -.015, -.56], mats.steel);
  box(engine, [1.31, .15, .06], [0, .05, .54], mats.black);
  box(engine, [.43, .25, .77], [0, 0, 0], mats.engine);
  box(engine, [.62, .115, .77], [0, .179, .015], mats.black);
  textPlane(engine, 'BMW M POWER  ·  S62 V8', .55, .12, [0, .24, -.02], [-Math.PI / 2, 0, 0], '#e3e8e7');

  for (const side of [-1, 1]) {
    box(engine, [.28, .19, .83], [side * .32, .065, 0], mats.engine, [0, 0, side * -.27]);
    box(engine, [.19, .085, .83], [side * .37, .166, .008], mats.cover, [0, 0, side * -.27]);
    for (let z = -.30; z < .36; z += .20) {
      cylinder(engine, .052, .052, .065, [side * .214, .12, z], mats.metal);
      box(engine, [.030, .023, .041], [side * .422, .177, z], mats.metal);
    }
    box(engine, [.23, .148, .26], [side * .325, .056, -.42], mats.steel);
    box(engine, [.24, .155, .31], [side * .60, .032, -.27], mats.black);
    cylinder(engine, .049, .055, .25, [side * .49, .093, -.27], mats.rubber, [0, 0, Math.PI / 2]);
    cylinder(engine, .084, .10, .058, [side * .65, .09, .32], mats.steel);
    cylinder(engine, .033, .033, .026, [side * .65, .13, .32], mats.metal);
  }
  box(engine, [.41, .17, .065], [0, -.008, -.45], mats.engine);
  for (const [x, y, radius] of [[-.15, -.058, .066], [.015, .02, .091], [.18, -.053, .058]]) {
    cylinder(engine, radius, radius, .054, [x, y, -.49], mats.rubber, [Math.PI / 2, 0, 0]);
    cylinder(engine, radius * .54, radius * .54, .060, [x, y, -.50], mats.metal, [Math.PI / 2, 0, 0]);
  }
  cylinder(engine, .052, .052, .035, [-.36, .211, .24], mats.black);
  box(engine, [.16, .13, .15], [.60, .025, .09], mats.cover);
}

function openCompartments(shell, hood, trunk) {
  const liner = shell.getObjectByName('Object_25_black_0');
  const frame = shell.getObjectByName('Object_43_frame_0');
  if (!liner?.geometry.index || !frame?.geometry.index) return;
  // The source GLB combines both lid liners with the fixed black trim.
  // These triangle ranges are the connected liner components in e39.glb.
  const rearFaces = [[170, 198], [279, 306], [1195, 1336], [1519, 1520], [1523, 1523]];
  const fixed = [], front = [], rear = [];
  const indices = liner.geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    const face = i / 3;
    const target = face >= 1337 && face <= 1518 ? front
      : rearFaces.some(([start, end]) => face >= start && face <= end) ? rear : fixed;
    target.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  for (const [hinge, panel] of [[hood, front], [trunk, rear]]) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(liner.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(panel);
    const lining = liner.clone();
    lining.geometry = geometry;
    liner.parent.add(lining);
    hinge.attach(lining);
  }
  liner.geometry.setIndex(fixed);

  // Remove the double-sided sheet over the engine while retaining the front frame and trunk floor.
  const bayCover = new Set([95, 105, 139, 140, 150, 151, 152, 153, 165, 166, 167, 168, 169, 170, 175, 203]);
  frame.geometry.setIndex(Array.from(frame.geometry.index.array).filter((_, i) => !bayCover.has(Math.floor(i / 3))));
}

export async function fitE39(world) {
  const { car, engine, box, mats } = world;
  const draco = new DRACOLoader().setDecoderPath('./vendor/draco/').setWorkerLimit(2);
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('./assets/bmw/e39.glb')
    .finally(() => draco.dispose());
  for (const child of [...car.children]) if (child !== engine) child.removeFromParent();
  buildS62(world);
  engine.visible = false;
  const shell = gltf.scene;
  shell.position.y = .205;
  car.add(shell);

  const moving = new Map();
  const windows = windowTint('E39 tinted glazing');
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
      mesh.material = windows;
      mesh.castShadow = false;
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
  openCompartments(shell, hood, trunk);
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
  box(car, [1.21, .045, .70], [0, .485, 1.89], upholstery);
  box(car, [1.20, .31, .05], [0, .63, 1.55], upholstery);
  for (const x of [-.61, .61]) box(car, [.11, .27, .66], [x, .63, 1.9], upholstery);
  for (const x of [-.42, .42]) box(car, [.37, .105, .63], [x, .645, 1.89], upholstery);
  box(car, [.43, .047, .43], [BATTERY.x, .518, BATTERY.z], mats.steel);
  box(car, [.36, .145, .25], [BATTERY.x, .60, BATTERY.z], mats.black);
  box(car, [.032, .021, .28], [BATTERY.x, .682, BATTERY.z], mats.steel);
  for (const [x, mat] of [[-.124, mats.red], [.124, mats.metal]]) {
    world.cylinder(car, .025, .029, .027, [x, .685, 2.052], mat);
    box(car, [.034, .033, .112], [x, .659, 2.145], x < 0 ? mats.red : mats.black);
  }
  world.textPlane(car, '+   12 V   −', .28, .075, [0, .674, 2.023], [-Math.PI / 2, 0, 0], '#f0bd78');
  const batteryHatch = new THREE.Group();
  batteryHatch.position.set(0, .713, 1.565);
  car.add(batteryHatch);
  box(batteryHatch, [.45, .035, .61], [0, 0, .308], upholstery);
  box(batteryHatch, [.13, .019, .037], [0, .025, .545], mats.steel);

  const brakeLamps = new THREE.MeshStandardMaterial({
    color: 0x8c1209, emissive: 0xf72814, emissiveIntensity: 0, transparent: true, opacity: .78,
  });
  const lampMeshes = [-1,1].map(side => box(car,[.23,.057,.012],[side*.576,.817,2.265],brakeLamps));
  for (const lamp of lampMeshes) lamp.visible = false;
  const cargoLight = new THREE.PointLight(0xffd9a3, 1.7, 1.2);
  cargoLight.position.set(.45, .87, 1.84);
  cargoLight.visible = false;
  car.add(cargoLight);
  const bayLight = new THREE.PointLight(0xe0e9ff, 2.4, 1.6);
  bayLight.position.set(0, 1.13, -1.6);
  bayLight.visible = false;
  car.add(bayLight);
  const paints = new Set();
  shell.traverse(o => { if (o.isMesh && o.material.name === 'body') paints.add(o.material); });
  // Some paint parts were moved out of the source hierarchy to their hinges.
  for (const panel of [hood,trunk,...Object.values(carDoors)]) panel.traverse(o => {
    if (o.isMesh && o.material.name === 'body') paints.add(o.material);
  });
  return { windows, hood, trunk, batteryHatch, cargoLight, bayLight, carDoors, wheels, hubs, steering, paints, brakeLamps, lampMeshes };
}
