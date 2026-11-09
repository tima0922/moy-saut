import * as THREE from 'three';
import { WHEEL_X, WHEEL_Z } from './vehicle.js?v=09';

const profiles = {
  f90: {
    // [longitudinal position, width at the shoulder, shoulder height]
    belt: [[-2.34,.79,.73],[-2.19,.90,.84],[-1.63,.95,.91],[-.82,.94,.97],
      [0,.91,.97],[.88,.93,.99],[1.57,.96,.96],[2.16,.89,.90],[2.34,.81,.83]],
    glass: [[-.96,.81,.97],[-.48,.74,1.31],[-.21,.70,1.39],[.57,.68,1.39],
      [.92,.72,1.29],[1.40,.82,.98]],
    engine: 'BMW M POWER · S63',
  },
  cls: {
    belt: [[-2.34,.75,.68],[-2.16,.87,.80],[-1.55,.94,.89],[-.82,.92,.92],
      [0,.90,.94],[.8,.94,.95],[1.44,.96,.93],[2.08,.89,.82],[2.34,.73,.75]],
    glass: [[-.88,.79,.92],[-.49,.69,1.22],[-.14,.65,1.35],[.35,.65,1.35],
      [.75,.68,1.25],[1.57,.81,.92]],
    engine: 'AMG · M156 6.2 V8',
  },
};

function loft(parent, rows, material) {
  const vertices = rows.flat(2);
  const width = rows[0].length;
  const indices = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < width - 1; j++) {
      const a = i * width + j;
      indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
}

export function buildPitCar(world, id) {
  const { box, cylinder, textPlane, mats } = world;
  const { belt, glass, engine: engineLabel } = profiles[id];
  const cls = id === 'cls';
  const root = new THREE.Group();
  const group = (parent, x, y, z) => {
    const node = new THREE.Group();
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  };
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x335e86, metalness: .63, roughness: .26, clearcoat: .8,
    clearcoatRoughness: .18, envMapIntensity: .7, side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x171c21, roughness: .45, side: THREE.DoubleSide });
  const cabinGlass = new THREE.MeshPhysicalMaterial({
    color: 0x304956, metalness: .55, roughness: .19, clearcoat: .65, envMapIntensity: .62, side: THREE.DoubleSide,
  });
  const bright = new THREE.MeshStandardMaterial({ color: 0xe4e6da, emissive: 0x97c9e7, emissiveIntensity: .65 });
  const brakeLamps = new THREE.MeshStandardMaterial({ color: 0x971716, emissive: 0xff170b, emissiveIntensity: .22 });

  function section(z) {
    const i = belt.findIndex(row => row[0] >= z);
    if (i <= 0) return belt[i === 0 ? 0 : belt.length - 1].slice(1);
    const [a, b] = [belt[i - 1], belt[i]];
    const t = (z - a[0]) / (b[0] - a[0]);
    return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
  }

  // Cut wheel openings into each side panel around the actual axle centers.
  const sections = [...new Set([...belt.map(p => p[0]), ...[WHEEL_Z[0], WHEEL_Z[1]].flatMap(axle =>
    Array.from({ length: 17 }, (_, i) => axle + (i - 8) * .047))])].sort((a, b) => a - b);
  for (const side of [-1, 1]) {
    loft(root, sections.map(z => {
      const [w, h] = section(z);
      const distance = Math.min(Math.abs(z - WHEEL_Z[0]), Math.abs(z - WHEEL_Z[1]));
      const skirt = distance < .369 ? .30 + Math.sqrt(.369 ** 2 - distance ** 2) : .25;
      return [[side * (w - .075), skirt, z], [side * w, Math.max(skirt, h - .22), z],
        [side * (w - .025), h, z], [side * (w - .18), h + .012, z]];
    }), paint);
    for (const z of [-.63, .44, 1.19]) {
      const [w, h] = section(z);
      box(root, [.023, .025, .14], [side * (w - .01), h - .09, z], mats.steel);
    }
  }
  box(root, [1.4, .09, 4.3], [0, .27, 0], trim);

  const hood = group(root, 0, section(-.87)[1], -.87);
  const trunk = group(root, 0, section(1.53)[1], 1.53);
  function panel(parent, stations) {
    loft(parent, stations.map(z => {
      const [w, h] = section(z);
      const y = h - parent.position.y;
      return [[-w + .168,y,z-parent.position.z],[-w*.47,y+.029,z-parent.position.z],
        [0,y+.043,z-parent.position.z],[w*.47,y+.029,z-parent.position.z],
        [w-.168,y,z-parent.position.z]];
    }), paint);
  }
  panel(hood, [-2.29, -2.16, -1.6, -.89]);
  panel(trunk, [1.54, 1.77, 2.12, 2.31]);
  box(root, [1.52, .12, .36], [0,.81,1.37], paint);
  box(root, [cls ? 1.48 : 1.64, .35, .23], [0,.56,2.23], paint);
  box(root, [cls ? 1.40 : 1.55, .066, .035], [0,.732,2.347], paint);
  box(root, [1.6, .31, .19], [0,.51,-2.23], paint);
  box(root, [1.43, .105, .07], [0,.44,-2.34], trim);
  box(root, [1.47, .042, .11], [0,.328,-2.34], trim);
  box(root, [1.50, .12, .16], [0,.375,2.30], trim);

  loft(root, glass.map(([z, w, h], i) => {
    const low = section(z)[1];
    const edge = i === 0 || i === glass.length - 1;
    return [[-w - (edge ? 0 : .08),low,z],[-w,h,z],[-w*.55,h+.024,z],
      [w*.55,h+.024,z],[w,h,z],[w+(edge ? 0 : .08),low,z]];
  }), cabinGlass);
  loft(root, glass.slice(2,4).map(([z,w,h]) =>
    [[-w,h+.006,z],[-w*.55,h+.031,z],[w*.55,h+.031,z],[w,h+.006,z]]), paint);
  for (const side of [-1,1]) {
    for (const z of [-.06,.60]) {
      box(root, [.029, .38, .048], [side * .71, 1.145, z], trim, [0,0,side * -.22]);
    }
    box(root, [.21,.09,.16], [side*.92,1.01,-.53], paint, [0,side*.11,0]);
    const headlight = box(root, [cls ? .45 : .48, cls ? .109 : .075, .14],
      [side*.59,.742,-2.23], bright, [0,-side*.24,side*.12]);
    headlight.castShadow = false;
    box(root, [.455,.092,.036], [side*.51,.691,2.356], trim, [0,0,side*.07]);
    box(root, [.422,.063,.026], [side*.51,.691,2.380], brakeLamps, [0,0,side*.07]);
    for (const offset of [.53,.70]) cylinder(root,.043,.05,.14,[side*offset,.31,2.34],mats.metal,[Math.PI/2,0,0]);
  }
  if (cls) {
    const emblem = new THREE.Group();
    emblem.position.set(0,.745,-2.389);
    root.add(emblem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.062,.005,8,26), mats.steel);
    emblem.add(ring);
    for (let i=0;i<3;i++) {
      const angle = i*2*Math.PI/3;
      box(emblem,[.008,.062,.009],[-Math.sin(angle)*.031,Math.cos(angle)*.031,0],mats.steel,[0,0,angle]);
    }
  }
  for (const x of cls ? [0] : [-.18,.18]) {
    const w = cls ? .67 : .31;
    box(root,[w,.17,.07],[x,.746,-2.327],mats.steel);
    box(root,[w-.03,.14,.074],[x,.746,-2.336],trim);
    if (cls) {
      for (const y of [.701,.746,.791]) box(root,[.63,.011,.009],[0,y,-2.379],mats.steel);
    } else {
      for (let i=0;i<6;i++) box(root,[.012,.135,.009],[x-.11+i*.044,.746,-2.379],mats.steel);
    }
  }
  textPlane(root, cls ? 'CLS 63' : 'M5', .28, .097, [.49,.772,2.362],[0,0,0],'#e9e9df');
  textPlane(root, 'DRIFT 67', .43, .105, [0,.585,2.364],[0,0,0],'#edf0dc','#151c21');

  const hubs = WHEEL_Z.map((z,i) => group(root,WHEEL_X[i],.33,z));
  const wheels = hubs.map((hub,i) => {
    const wheel = group(hub,0,0,0);
    const side = Math.sign(WHEEL_X[i]);
    cylinder(wheel,.333,.333,.245,[0,0,0],mats.rubber,[0,0,Math.PI/2],32);
    cylinder(wheel,.258,.258,.032,[side*.122,0,0],mats.steel,[0,0,Math.PI/2],28);
    cylinder(wheel,.231,.231,.036,[side*.136,0,0],trim,[0,0,Math.PI/2],28);
    cylinder(wheel,.071,.071,.06,[side*.155,0,0],mats.metal,[0,0,Math.PI/2],16);
    const count = cls ? 5 : 10;
    for (let n=0;n<count;n++) {
      const angle = n*2*Math.PI/count;
      box(wheel,[.023,.168,cls ? .035 : .019],
        [side*.159,.145*Math.cos(angle),.145*Math.sin(angle)],mats.steel,[angle,0,0]);
    }
    return wheel;
  });

  const engine = group(root,0,.49,-1.51);
  box(engine,[1.43,.06,1.23],[0,-.06,0],trim);
  for (const side of [-1,1]) {
    box(engine,[.38,.18,.8],[side*.29,.105,0],mats.engine,[0,0,side*-.23]);
    box(engine,[.23,.07,.83],[side*.34,.21,0],mats.steel,[0,0,side*-.23]);
    box(engine,[.21,.15,.39],[side*.59,.04,-.30],mats.black);
    if (!cls) {
      cylinder(engine,.094,.094,.18,[side*.18,.145,-.36],mats.metal,[0,0,Math.PI/2]);
      cylinder(engine,.045,.045,.26,[side*.28,.165,-.43],mats.rubber,[0,0,Math.PI/2]);
    }
  }
  box(engine,[cls ? .55 : .45,.09,.68],[0,.232,.04],mats.black);
  textPlane(engine,engineLabel,.43,.09,[0,.28,.04],[-Math.PI/2,0,0],'#e6e7df');
  box(root,[1.43,.055,.72],[0,.47,1.92],trim);
  box(root,[.36,.16,.26],[0,.57,1.99],mats.black);
  for (const side of [-1,1]) cylinder(root,.023,.026,.025,[side*.12,.66,2.04],side<0?mats.red:mats.steel);
  const batteryHatch = group(root,0,.702,1.58);
  box(batteryHatch,[1.35,.038,.70],[0,0,.35],trim);
  box(batteryHatch,[.14,.026,.039],[0,.027,.56],mats.steel);
  const bayLight = new THREE.PointLight(0xe0e9ff,2.2,1.5);
  bayLight.position.set(0,1.13,-1.6);
  const cargoLight = new THREE.PointLight(0xffdfb1,1.7,1.2);
  cargoLight.position.set(.48,1.02,1.95);
  bayLight.visible = cargoLight.visible = engine.visible = false;
  root.add(bayLight,cargoLight);
  return { root, engine, hood, trunk, batteryHatch, bayLight, cargoLight, hubs, wheels,
    paints:[paint], brakeLamps, lampMeshes:[], carDoors:{}, steering:null };
}
