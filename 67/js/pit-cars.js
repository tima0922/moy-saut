import { VEHICLE_ASSET_TIMEOUT, withAssetDeadline } from './asset-deadline.js?v=039';
import * as THREE from 'three';
import { windowTint } from './window-tint.js?v=041';
import { mergeRigidSurfaces } from './garage-visuals.js?v=041';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { WHEEL_X, WHEEL_Z } from './vehicle.js?v=013';

function makeServiceRig(world, id, spec) {
  const { box, cylinder, textPlane, mats } = world;
  const cls = id === 'cls';
  const supra = id === 'supra';
  const root = new THREE.Group();
  const group = (parent, x=0, y=0, z=0) => {
    const node = new THREE.Group();
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  };
  const trim = new THREE.MeshStandardMaterial({ color: 0x171c21, roughness: .45, side: THREE.DoubleSide });
  const brakeLamps = new THREE.MeshStandardMaterial({ color: 0x971716, emissive: 0xff170b, emissiveIntensity: .22 });
  const hood=group(root,...spec.hood), trunk=group(root,...spec.trunk);
  const carDoors={left:group(root,...spec.left),right:group(root,...spec.right)};
  const hubs = WHEEL_Z.map((z,i) => group(root,WHEEL_X[i],.30,z));
  const wheels = hubs.map(hub => group(hub));

  const engine = group(root,0,.49,-1.51);
  box(engine,[1.43,.06,1.23],[0,-.06,0],trim);
  if (supra) {
    box(engine,[.42,.16,1.08],[0,.11,0],mats.engine);
    for (const x of [-.105,.105]) box(engine,[.16,.075,.91],[x,.217,-.03],mats.steel);
    for (let i=0;i<6;i++) {
      cylinder(engine,.031,.031,.13,[-.29,.11,-.39+i*.151],mats.metal,[0,0,Math.PI/2]);
    }
    cylinder(engine,.128,.128,.17,[.36,.14,-.37],mats.steel,[0,0,Math.PI/2]);
    cylinder(engine,.071,.071,.25,[.45,.15,-.43],mats.metal,[0,0,Math.PI/2]);
    box(engine,[.14,.06,.79],[0,.268,-.01],mats.black);
  } else for (const side of [-1,1]) {
    box(engine,[.38,.18,.8],[side*.29,.105,0],mats.engine,[0,0,side*-.23]);
    box(engine,[.23,.07,.83],[side*.34,.21,0],mats.steel,[0,0,side*-.23]);
    box(engine,[.21,.15,.39],[side*.59,.04,-.30],mats.black);
    if (!cls) {
      cylinder(engine,.094,.094,.18,[side*.18,.145,-.36],mats.metal,[0,0,Math.PI/2]);
      cylinder(engine,.045,.045,.26,[side*.28,.165,-.43],mats.rubber,[0,0,Math.PI/2]);
    }
  }
  if (!supra) box(engine,[cls ? .55 : .45,.09,.68],[0,.232,.04],mats.black);
  textPlane(engine,spec.engine,supra ? .55 : .43,.09,[0,supra ? .301 : .28,.04],[-Math.PI/2,0,0],'#e6e7df');
  const battery = group(root,0,0,0);
  box(battery,[1.43,.055,.72],[0,.47,1.92],trim);
  box(battery,[.36,.16,.26],[0,.57,1.99],mats.black);
  for (const side of [-1,1]) cylinder(battery,.023,.026,.025,[side*.12,.66,2.04],side<0?mats.red:mats.steel);
  const batteryHatch = group(root,0,.702,1.58);
  box(batteryHatch,[1.35,.038,.70],[0,0,.35],trim);
  box(batteryHatch,[.14,.026,.039],[0,.027,.56],mats.steel);
  const bayLight = new THREE.PointLight(0xe0e9ff,2.2,1.5);
  bayLight.position.set(0,1.13,-1.6);
  const cargoLight = new THREE.PointLight(0xffdfb1,1.7,1.2);
  cargoLight.position.set(.48,1.02,1.95);
  bayLight.visible = cargoLight.visible = engine.visible = false;
  root.add(bayLight,cargoLight);
  return { root, engine, hood, trunk, battery, batteryHatch, bayLight, cargoLight, hubs, wheels,
    brakeLamps, lampMeshes:[], carDoors, steering:null };
}

const externalRigs = {
  f90: {
    file: 'f90-m5.glb', engine:'BMW M POWER · S63', brake:'bM_LightGlassNormal_OuterRed_Low1', windows: /^bM_Glass_WindowFront/i, paint: /^(bM_CarPaint_Max)/i,
    hood: [0,.92,-.87], trunk: [0,1.0,1.61],
    left: [-.81,.79,-.80], right: [.81,.79,-.80],
  },
  cls: {
    file: 'cls-w219.glb', engine:'AMG · M156 6.2 V8', brake:'CLS500_tailglass', windows: /black_glass3_int/i, paint: /CLS500_body/i,
    hood: [0,.93,-.87], trunk: [0,.93,1.77],
    left: [-.79,.76,-.73], right: [.79,.76,-.73],
  },
  supra: {
    file:'supra-a80.glb',engine:'TOYOTA · 2JZ-GTE',brake:'a80 brake red',windows:/^glass(?:\.|$)/i,paint:/^carpaint$/i,
    hood:[0,.845,-1.04],trunk:[0,1.18,.76],
    left:[-.77,.82,-1.03],right:[.77,.82,-1.03],
  },
};

export async function loadPitCar(world, id) {
  const spec = externalRigs[id];
  if (!spec) throw new Error('Unknown detailed model: '+id);
  const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  try {
    const { scene: shell } = await withAssetDeadline(loader.loadAsync('./assets/club/' + spec.file), VEHICLE_ASSET_TIMEOUT);
    const visual = makeServiceRig(world,id,spec);
    const { root, hood, trunk, carDoors, wheels, hubs } = visual;
    const parts = [];
    const paints = new Set();
    const windows = windowTint(id + ' tinted glazing');
    shell.traverse(object => {
      if (object.userData.garagePart) parts.push(object);
      if (!object.isMesh) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .map(mat => spec.windows.test(mat.name) ? windows : mat);
      object.material = Array.isArray(object.material) ? materials : materials[0];
      for (const mat of materials) {
        // Thin lenses can use alpha without a scene-wide transmission render.
        if (mat.transmission>0) {
          mat.transmission=0;
          mat.transparent=true;
          mat.depthWrite=false;
          mat.forceSinglePass=true;
        }
        if (spec.paint.test(mat.name)) paints.add(mat);
        if (mat.name === spec.brake) {
          visual.brakeLamps = mat;
          mat.emissive.setHex(0xc72012);
          mat.emissiveIntensity = .22;
        }
      }
      object.castShadow = materials.every(mat => !mat.transparent);
      object.receiveShadow = true;
    });
    const named = new Set(parts.map(object => object.userData.garagePart));
    const required = ['hood','trunk','left','right','wheel0','wheel1','wheel2','wheel3'];
    if (!paints.size || required.some(part=>!named.has(part))) {
      throw new Error('Missing paint, panels or wheels in '+spec.file);
    }
    root.add(shell);
    const pivots = { hood,trunk,...carDoors };
    for (const [i,wheel] of wheels.entries()) {
      pivots['wheel'+i] = wheel;
      pivots['hub'+i] = hubs[i];
    }
    root.updateMatrixWorld(true);
    for (const object of parts) pivots[object.userData.garagePart]?.attach(object);
    for (const group of [shell,hood,trunk,...Object.values(visual.carDoors),...wheels]) mergeRigidSurfaces(group);
    for (const [index,hub] of hubs.entries()) mergeRigidSurfaces(hub,[wheels[index]]);
    visual.paints = [...paints];
    visual.windows = windows;
    visual.asset = spec.file;
    return visual;
  } finally {
    draco.dispose();
  }
}
