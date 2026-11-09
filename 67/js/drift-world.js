import * as THREE from 'three';
import { batchSharedMeshes } from './garage-visuals.js';
import { ARENA, ENTRY_ANGLE, PIT_MERGE, ROAD_HALF } from './drift.js?v=09';

export function createDriftWorld(world, layout, asphalt) {
  const { scene, box, textPlane } = world;
  const { road, directions, gates } = layout;
  const group = new THREE.Group();
  scene.add(group);
  group.visible = false;
  const obstacles = [];
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: .88 });
  const concrete = material(0x778087);
  const dark = material(0x28343d);
  const red = material(0xad492f);
  const white = material(0xe3ddd0);
  const lime = new THREE.MeshStandardMaterial({ color: 0xc5e78a, roughness: .7, emissive: 0x738e37, emissiveIntensity: .25 });
  const ridge = material(0x586d75);
  const ridgeShade = material(0x485b66);
  const roof = material(0x353e43);
  const roadMaterial = asphalt.clone();
  roadMaterial.color.set(0x626e77);
  roadMaterial.map = asphalt.map.clone();
  roadMaterial.map.repeat.set(1, 1);
  const apron = roadMaterial.clone();
  apron.color.set(0x89938e);

  function ribbon(left, right, y, materials, section = 0) {
    const vertices = [];
    const uv = [];
    const indices = [];
    const geometry = new THREE.BufferGeometry();
    for (let i = 0; i < road.length; i++) {
      const p = road[i], d = directions[i];
      for (const edge of [left, right]) {
        const x = p.x - d.z * edge, z = p.z + d.x * edge;
        vertices.push(x, y, z);
        uv.push(x * .19, z * .19);
      }
      const a = i * 2, b = (a + 2) % (road.length * 2);
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    if (section) {
      for (let i = 0; i < road.length; i += section) {
        geometry.addGroup(i * 6, Math.min(section, road.length - i) * 6, Math.floor(i / section) % 2);
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.d), apron);
  apron.map = roadMaterial.map.clone();
  apron.map.repeat.set(22, 22);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ARENA.x, -.024, ARENA.z);
  floor.receiveShadow = true;
  group.add(floor);
  ribbon(-ROAD_HALF, ROAD_HALF, -.012, roadMaterial);
  for (const side of [-1, 1]) {
    const edge = ROAD_HALF * side;
    ribbon(edge - .08, edge + .08, .004, white);
    ribbon(edge - .32 + side * .39, edge + .32 + side * .39, -.001, [red, white], 2);
  }

  function barrier(x, z, w, d) {
    obstacles.push({ x, z, w, d, h: 1.15 });
    box(group, [w, 1.15, d], [x, .575, z], concrete);
    box(group, [w + .06, .15, d + .06], [x, .91, z], dark);
  }
  for (const x of [-55.5, 55.5]) barrier(x, ARENA.z, .55, 110);
  barrier(0, ARENA.z + 55.5, 112, .55);
  for (const x of [-30.5, 30.5]) barrier(x, ARENA.z - 55.5, 51, .55);

  const approach = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .007, 116), new THREE.Vector3(0, .007, 125),
    new THREE.Vector3(2.1, .007, 130), new THREE.Vector3(7.4, .007, 134.2),
    new THREE.Vector3(14, .007, 135.2),
  ]);
  const guide = approach.getSpacedPoints(16);
  for (let i = 0; i < guide.length - 1; i += 2) {
    const point = guide[i].clone().lerp(guide[i + 1], .5);
    const delta = guide[i + 1].clone().sub(guide[i]);
    const dash = box(group, [.18, .009, delta.length()], point.toArray(), lime,
      [0, Math.atan2(delta.x, delta.z), 0]);
    dash.castShadow = false;
  }
  box(group, [9.4, .012, .29], [0, .006, PIT_MERGE], lime);
  for (const x of [-5.15, 5.15]) {
    box(group, [.27, 2.55, .27], [x, 1.275, PIT_MERGE], dark);
    box(group, [.31, .80, .31], [x, 1.88, PIT_MERGE], lime);
    obstacles.push({ x, z: PIT_MERGE, w: .3, d: .3, h: 2.55 });
  }
  textPlane(group, 'КОНТУР 67  /  НАЧАЛО ЗАЕЗДА  ↖', 8.2, .65,
    [0, 3.35, PIT_MERGE], [0, Math.PI, 0], '#dff3bc', '#202a31');
  textPlane(group, 'БОКС 01  /  ВОЗВРАТ', 5.5, .55,
    [0, 3.35, PIT_MERGE + .04], [0, 0, 0], '#ffca90', '#202a31');

  const markers = [];
  for (const [index, gate] of gates.entries()) {
    const startLine = index === gates.length - 1;
    const span = ROAD_HALF + .85;
    const frame = new THREE.Group();
    frame.position.copy(gate.position);
    frame.rotation.y = Math.atan2(gate.direction.x, gate.direction.z);
    group.add(frame);
    const bulbs = [];
    for (const side of [-1, 1]) {
      const x = span * side;
      box(frame, [1.5, .35, 1.1], [x, .175, 0], concrete);
      box(frame, [.27, 2.5, .27], [x, 1.25, 0], dark);
      bulbs.push(box(frame, [.38, .78, .32], [x, 1.78, 0], lime));
      const [worldX, worldZ] = [frame.position.x + Math.cos(frame.rotation.y) * x,
        frame.position.z - Math.sin(frame.rotation.y) * x];
      obstacles.push({ x: worldX, z: worldZ, w: .45, d: .45, h: 2.5 });
    }
    const line = box(frame, [ROAD_HALF * 2, .009, .20], [0, .006, 0], lime);
    line.castShadow = false;
    markers.push([line, ...bulbs]);
    if (startLine) {
      const board = box(frame, [3.9, 1.05, .22], [-span - 1.4, 2.74, .15], dark);
      board.rotation.y = -.16;
      textPlane(frame, 'GARAGE LIFE / DRIFT 67', 3.8, .57, [-span - 1.4, 2.74, -.01],
        [0, Math.PI - .16, 0], '#dff3bc', '#202a31');
    } else {
      textPlane(frame, String(index + 1).padStart(2, '0'), .62, .48,
        [-span, 2.37, -.19], [0, Math.PI, 0], '#e8efe2', '#202a31');
    }
  }

  for (const [x, z, width, color] of [[50, 151, 8, red], [50, 157, 8, dark], [-45, 222, 12, dark], [-30, 222, 12, red]]) {
    box(group, [width, 2.7, 2.7], [x, 1.35, z], color);
    for (let dx = -width / 2 + .3; dx < width / 2; dx += .45) {
      box(group, [.11, 2.62, .07], [x + dx, 1.35, z - 1.36], color);
    }
    obstacles.push({ x, z, w: width, d: 2.7, h: 2.7 });
  }
  for (const [x, z] of [[-53, 124], [49, 124], [52, 192], [-52, 197], [44, 223], [4, 223]]) {
    box(group, [.22, 6.5, .22], [x, 3.25, z], dark);
    box(group, [1.18, .14, .38], [x, 6.4, z], dark);
    box(group, [.95, .025, .29], [x, 6.32, z], world.mats.light);
    obstacles.push({ x, z, w: .27, d: .27, h: 6.5 });
  }

  // Exterior silhouettes give the arena a horizon without adding collision geometry.
  for (const [x, z, w, h] of [[-45, 103, 25, 6], [-22, 105, 23, 8], [22, 105, 25, 5],
    [65, 132, 19, 8], [65, 166, 23, 12], [63, 201, 18, 6], [32, 238, 25, 9],
    [-4, 241, 32, 5], [-42, 239, 24, 11], [-66, 183, 15, 7], [-66, 143, 14, 9]]) {
    const structure = box(group, [w, h, 10], [x, h / 2 - .08, z], h > 7 ? ridge : ridgeShade);
    structure.castShadow = false;
    const cap = box(group, [w + .55, .26, 10.5], [x, h, z], roof);
    cap.castShadow = false;
  }
  for (const [x, z] of [[51, 132], [-51, 220], [47, 217], [-52, 132], [49, 178]]) {
    for (let i = 0; i < 3; i++) {
      world.cylinder(group, .33, .33, .21, [x, .105 + i * .21, z], dark, [0, 0, 0], 12);
    }
  }
  batchSharedMeshes(group);
  let active = -1;
  const fx = createTireEffects(group);
  return {
    group, obstacles, fx,
    markGate(index) {
      if (active === index) return;
      active = index;
      for (const [i, marker] of markers.entries()) {
        for (const mesh of marker) mesh.material = i === active ? lime : white;
      }
    },
  };
}

function createTireEffects(group) {
  const limit = 320;
  const markGeometry = new THREE.PlaneGeometry();
  markGeometry.rotateX(-Math.PI / 2);
  const marks = new THREE.InstancedMesh(markGeometry,
    new THREE.MeshBasicMaterial({ color: 0x192022, transparent: true, opacity: .58, depthWrite: false }), limit);
  marks.frustumCulled = false;
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(marks);
  const matrix = new THREE.Object3D();
  const trails = [null, null];
  let cursor = 0, count = 0, elapsed = 0;
  const smoke = [];
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 64;
  const ctx = textureCanvas.getContext('2d');
  const cloud = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  cloud.addColorStop(0, '#fff');
  cloud.addColorStop(.45, '#ffffffa0');
  cloud.addColorStop(1, '#ffffff00');
  ctx.fillStyle = cloud;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(textureCanvas);
  for (let i = 0; i < 24; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, color: 0xc4c4be, transparent: true, depthWrite: false,
    }));
    sprite.visible = false;
    group.add(sprite);
    smoke.push({ sprite, age: Infinity });
  }
  let puff = 0;
  marks.count = 0;

  return {
    reset() {
      marks.count = cursor = count = puff = elapsed = 0;
      trails.fill(null);
      for (const p of smoke) {
        p.age = Infinity;
        p.sprite.visible = false;
      }
    },
    tick(dt, physics, high, handbrake) {
      const intensity = Math.min(1, Math.abs(physics.slip) * 1.7);
      const skidding = physics.grounded && physics.totalSpeed > 4 &&
        (Math.abs(THREE.MathUtils.radToDeg(physics.slip)) >= ENTRY_ANGLE || handbrake);
      elapsed += dt;
      if (elapsed < .055) return;
      for (const p of smoke) {
        if (p.age >= 1.55) {
          p.sprite.visible = false;
          continue;
        }
        p.age += elapsed;
        p.sprite.position.y += elapsed * .48;
        p.sprite.position.x += elapsed * .48;
        p.sprite.scale.setScalar(.65 + p.age * 1.65);
        p.sprite.material.opacity = p.strength * .4 * Math.max(0, 1 - p.age / 1.55);
        p.sprite.visible = high;
      }
      for (let i = 0; i < 2; i++) {
        const contact = skidding ? physics.wheelContact(i ? 3 : 1) : null;
        const last = trails[i];
        trails[i] = contact;
        if (!contact || !last || Math.abs(contact.y) > .08) continue;
        const dx = contact.x - last.x, dz = contact.z - last.z;
        const length = Math.hypot(dx, dz);
        if (length < .12 || length > 2.8) continue;
        matrix.position.set((contact.x + last.x) / 2, .011, (contact.z + last.z) / 2);
        matrix.rotation.y = Math.atan2(dx, dz);
        matrix.scale.set(.19, 1, length + .055);
        matrix.updateMatrix();
        marks.setMatrixAt(cursor, matrix.matrix);
        cursor = (cursor + 1) % limit;
        count = Math.min(limit, count + 1);
        marks.count = count;
        marks.instanceMatrix.needsUpdate = true;
        if (high && (cursor % 3 === 0)) {
          const p = smoke[puff++ % smoke.length];
          p.age = 0;
          p.strength = Math.max(.32, intensity);
          p.sprite.position.set(contact.x, .21, contact.z);
          p.sprite.scale.setScalar(.65);
          p.sprite.material.opacity = p.strength * .4;
          p.sprite.visible = true;
        }
      }
      elapsed = 0;
    },
  };
}
