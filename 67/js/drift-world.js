import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batchSharedMeshes } from './garage-visuals.js';
import { makeCircuitDetails } from './circuit-detail.js?v=017';
import { ENTRY_ANGLE, ROAD_HALF } from './drift.js?v=015';

export function createDriftWorld(world, layout, asphalt, terrain, shortLayout) {
  const { scene, box, textPlane } = world;
  const { road, directions, gates, arena } = layout;
  const { heightAt } = terrain;
  const group = new THREE.Group();
  scene.add(group);
  group.visible = false;
  const obstacles = [];
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: .88 });
  const concrete = material(0x778087);
  const dark = material(0x28343d);
  const red = material(0xad492f);
  const blue = material(0x247e94);
  const white = material(0xe3ddd0);
  const lime = new THREE.MeshStandardMaterial({ color: 0xc5e78a, roughness: .7, emissive: 0x738e37, emissiveIntensity: .25 });
  const ridge = material(0x586d75);
  const ridgeShade = material(0x485b66);
  const roof = material(0x353e43);
  const connector = shortLayout.connector;
  const branchDirections = connector.map((_,i) => connector[Math.min(i+1,connector.length-1)]
    .clone().sub(connector[Math.max(0,i-1)]).normalize());
  const details = makeCircuitDetails(layout,connector,branchDirections);
  group.add(makeCircuitFloor(terrain,asphalt,{ red:red.color,blue:blue.color,white:white.color },details));
  const overMain = (x,z) => road.some(p => (p.x-x)**2+(p.z-z)**2 < (ROAD_HALF+.65)**2);

  function barrier(x, z, w, d) {
    obstacles.push({ x, z, w, d, h: 1.15 });
    box(group, [w, 1.15, d], [x, .575, z], concrete);
    box(group, [w + .06, .15, d + .06], [x, .91, z], dark);
  }
  const sideX = arena.w / 2 - .5;
  const endZ = arena.d / 2 - .5;
  for (const x of [-sideX, sideX]) barrier(x, arena.z, .55, arena.d);
  for (const z of [arena.z - endZ, arena.z + endZ]) barrier(0, z, arena.w, .55);

  // Start grid and clipping markers use the same centerline as drift scoring.
  for (const [i, label] of [[0,'СТАРТ / ФИНИШ'],[37,'ДЛИННАЯ ДУГА'],[79,'ПЕРЕКЛАДКА'],[147,'ШПИЛЬКА']]) {
    const p = road[i], d = directions[i];
    const edge = ROAD_HALF + 2.4;
    textPlane(group, label, 5.3, .61, [p.x + d.z * edge, 2.1, p.z - d.x * edge],
      [0, Math.atan2(-d.x, -d.z), 0], '#eff3df', '#27333c');
  }
  const start = road[0], tangent = directions[0];
  const grid = new THREE.Group();
  grid.position.copy(start);
  grid.rotation.y = Math.atan2(tangent.x, tangent.z);
  group.add(grid);
  for (let i = 0; i < 24; i++) {
    const x = (i % 12 - 5.5) * 1.2;
    const z = (i < 12 ? -.26 : .26) - 1.85;
    box(grid,[1.2,.009,.52],[x,.008,z],(i + Number(i >= 12)) % 2 ? white : dark).castShadow = false;
  }

  const markers = new Map();
  for (const [index, gate] of [...gates,shortLayout.gates.at(-1)].entries()) {
    const shortGate = index === gates.length;
    const startLine = index === gates.length - 1;
    const span = ROAD_HALF + .85;
    const frame = new THREE.Group();
    frame.position.copy(gate.position);
    frame.position.y = heightAt(gate.position.x,gate.position.z);
    frame.rotation.y = Math.atan2(gate.direction.x, gate.direction.z);
    group.add(frame);
    const bulbs = [];
    for (const side of [-1, 1]) {
      const x = span * side;
      const wx = frame.position.x + Math.cos(frame.rotation.y)*x;
      const wz = frame.position.z - Math.sin(frame.rotation.y)*x;
      const base = heightAt(wx,wz) - frame.position.y;
      if (shortGate && overMain(wx,wz)) continue;
      box(frame, [1.5, .35, 1.1], [x, .175+base, 0], shortGate ? blue : concrete);
      box(frame, [.27, 2.5, .27], [x, 1.25+base, 0], dark);
      bulbs.push(box(frame, [.38, .78, .32], [x, 1.78+base, 0], white));
      // Timing flags are lightweight markers and do not obstruct a clipping line.
    }
    markers.set(gate,bulbs);
    if (gate.clip) {
      const cx = gate.clip.offset;
      const clipColor = new THREE.MeshStandardMaterial({ color: 0xffbd38, emissive: 0xff7d12, emissiveIntensity: .23 });
      for (let segment=-2; segment<=2; segment++) {
        const x = cx+segment*.62;
        const wx = frame.position.x+Math.cos(frame.rotation.y)*x;
        const wz = frame.position.z-Math.sin(frame.rotation.y)*x;
        const y = heightAt(wx,wz)-frame.position.y;
        box(frame,[.51,.018,.76],[x,y+.085,0],clipColor).castShadow = false;
      }
      const side = Math.sign(cx);
      const bannerX = side*(ROAD_HALF+.85);
      if (!shortGate) textPlane(frame, `CLIP ${index+1}`,1.5,.38,[bannerX,2.95,-.17],[0,Math.PI,0],'#ffd16b','#22302c');
    }
    if (startLine) {
      const board = box(frame, [3.9, 1.05, .22], [-span - 1.4, 2.74, .15], dark);
      board.rotation.y = -.16;
      textPlane(frame, 'GARAGE LIFE / DRIFT 67', 3.8, .57, [-span - 1.4, 2.74, -.01],
        [0, Math.PI - .16, 0], '#dff3bc', '#202a31');
    } else if (!shortGate) {
      textPlane(frame, String(index + 1).padStart(2, '0'), .62, .48,
        [-span, 2.37, -.19], [0, Math.PI, 0], '#e8efe2', '#202a31');
    }
  }
  for (const [i,caption] of [[4,'КОРОТКАЯ ПЕТЛЯ →'],[17,'← КОНТУР 67']]) {
    const p=connector[i], d=branchDirections[i];
    const x=p.x+d.z*9.5, z=p.z-d.x*9.5;
    textPlane(group,caption,5,.65,[x,heightAt(x,z)+1.8,z],
      [0,Math.atan2(-d.x,-d.z),0],'#dffaff','#1b5260');
  }

  for (const [x,z,width,color] of [[76,127,8,red],[76,134,8,dark],[-76,235,8,dark],[-76,243,8,red]]) {
    box(group,[width,2.7,2.7],[x,1.35,z],color);
    obstacles.push({ x,z,w:width,d:2.7,h:2.7 });
  }
  for (const [x,z,w,h] of [[-58,99,24,5],[25,99,29,9],[70,99,29,6],[97,151,10,9],[96,200,10,8],
    [56,264,35,7],[-30,263,32,10],[-97,190,11,9],[-97,134,11,6]]) {
    box(group,[w,h,10],[x,h/2-.08,z],h > 7 ? ridge : ridgeShade).castShadow = false;
    box(group,[w+.55,.26,10.5],[x,h,z],roof).castShadow = false;
  }
  for (const [x,z] of [[-78,160],[81,176],[-76,209],[58,235],[80,217],[-79,124]]) {
    for (let i=0;i<4;i++) world.cylinder(group,.37,.37,.20,[x,.1+i*.2,z],dark,[0,0,0],12);
  }
  dressCircuit(world, group, road, directions, arena, heightAt);
  addTurnBoards(world,group,road,directions,connector,heightAt,dark);
  addGrandstands(world,group,obstacles);
  const kit = addTrackKit(group, obstacles);
  batchSharedMeshes(group);
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffb076, roughness: .7, emissive: 0xd15b26, emissiveIntensity: .22,
  });
  let active, guestActive;
  const fx = createTireEffects(group);
  return {
    group, obstacles, fx, kit, makeGuestEffects: () => createTireEffects(group),
    markGate(index, guestIndex = -1, route = layout) {
      const playerGate = route.gates[index], guestGate = route.gates[guestIndex];
      if (active === playerGate && guestActive === guestGate) return;
      active = playerGate;
      guestActive = guestGate;
      for (const [gate, marker] of markers) {
        for (const mesh of marker) mesh.material = gate === active ? lime : gate === guestActive ? amber : white;
      }
    },
  };
}

function addTurnBoards(world,group,road,directions,connector,heightAt,post) {
  const centerlines=[...road,...connector];
  for (const [i,caption,side,width] of [[137,'ШПИЛЬКА  ››   30 М',-1,4.6],[145,'15 М  ››',-1,2.5],
    [153,'›››',-1,2.8],[157,'›››',-1,2.8],[210,'ПЕТЛЯ  ››',1,3.5]]) {
    const p=road[i], d=directions[i];
    for (const sign of [side,-side]) {
      const distance=sign*(ROAD_HALF+2.4);
      const x=p.x-d.z*distance, z=p.z+d.x*distance;
      if (centerlines.some(point=>Math.hypot(point.x-x,point.z-z)<ROAD_HALF+1.45)) continue;
      const y=heightAt(x,z);
      world.box(group,[.14,1.48,.14],[x,y+.74,z],post).castShadow=false;
      world.textPlane(group,caption,width,.64,[x,y+1.57,z],[0,Math.atan2(-d.x,-d.z),0],
        '#1c2428','#f0ba57');
      break;
    }
  }
}

function dressCircuit(world, group, road, directions, arena, heightAt) {
  const { box, textPlane } = world;
  const teal = new THREE.MeshStandardMaterial({ color: 0x377877, roughness: .89 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xa5906a, roughness: 1 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x343a43, roughness: .83 });
  const pose = new THREE.Object3D();

  // A gantry defines the start without putting any obstacle on the racing surface.
  const gantry = new THREE.Group();
  gantry.position.copy(road[0]);
  gantry.rotation.y = Math.atan2(directions[0].x,directions[0].z);
  group.add(gantry);
  for (const x of [-10.1,10.1]) box(gantry,[.48,5.6,.57],[x,2.8,-2],rail);
  box(gantry,[20.7,.68,.58],[0,5.22,-2],rail);
  box(gantry,[18,.1,.62],[0,4.89,-2],teal);
  for (const yaw of [0,Math.PI]) {
    textPlane(gantry,'CONTOUR 67   /   DRIFT PARK',10.6,.52,[0,5.24,-2 + (yaw ? -.31 : .31)],
      [0,yaw,0],'#e5ffef','#24333a');
  }
  // Wide visual run-off pockets give each corner a different landmark.
  for (const [index,side,material] of [[48,1,teal],[91,-1,sand],[153,1,teal],[211,-1,sand]]) {
    const p = road[index], d = directions[index];
    for (let i=0;i<8;i++) {
      const z = (i - 3.5) * 1.24;
      const distance = ROAD_HALF + 1.7;
      const px=p.x+d.x*z-d.z*distance*side, pz=p.z+d.z*z+d.x*distance*side;
      const mesh = box(group,[.75,.012,.43],
        [px,heightAt(px,pz)+.07,pz],
        material,[0,Math.atan2(d.x,d.z)+.6,0]);
      mesh.castShadow = false;
    }
  }
  const tree = new THREE.IcosahedronGeometry(1,1);
  const trees = new THREE.InstancedMesh(tree,
    new THREE.MeshStandardMaterial({ color: 0x496648, roughness: 1 }), 126);
  for (let i=0;i<126;i++) {
    const angle = i * 2.39996;
    const radius = 1.16 + ((i*19)%17)*.024;
    const height = 4.7 + ((i*13)%11)*.59;
    pose.position.set(Math.cos(angle)*arena.w*.5*radius,height*.5-.4,arena.z+Math.sin(angle)*arena.d*.5*radius);
    pose.rotation.y = angle;
    pose.scale.set(height*.24,height*.50,height*.24);
    pose.updateMatrix();
    trees.setMatrixAt(i,pose.matrix);
  }
  group.add(trees);
}

function makeCircuitFloor(terrain, asphalt, curbColors, details) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(terrain.vertices,3));
  geometry.setAttribute('circuitSurface',new THREE.BufferAttribute(terrain.surface,3));
  const uv = new Float32Array(terrain.vertices.length/3*2);
  for (let i=0; i<uv.length/2; i++) uv.set([terrain.vertices[i*3]*.27,terrain.vertices[i*3+2]*.27],i*2);
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.setIndex(new THREE.BufferAttribute(terrain.indices,1));
  geometry.computeVertexNormals();

  const material = asphalt.clone();
  material.color.set(0xffffff);
  material.map = asphalt.map.clone();
  material.map.repeat.set(1,1);
  material.bumpMap = material.map;
  material.bumpScale = .018;
  material.roughnessMap = null;
  material.roughness = .9;
  const grass = grassTexture();
  const colors = { tarmac:0x535961, gravel:0xa19780, verge:0x43543d };
  material.onBeforeCompile = shader => {
    shader.uniforms.vergeMap = { value:grass };
    shader.uniforms.detailMap = { value:details.map };
    shader.uniforms.detailBounds = { value:details.bounds };
    for (const [name,color] of Object.entries(colors)) shader.uniforms[`${name}Tint`] = { value:new THREE.Color(color) };
    for (const [name,color] of Object.entries(curbColors)) shader.uniforms[`${name}Curb`] = { value:color };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',`#include <common>
        attribute vec3 circuitSurface;
        varying vec3 vCircuitSurface;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vCircuitSurface = circuitSurface;`);
    // The collision mesh carries every surface color, including the union of both routes.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',`#include <common>
        varying vec3 vCircuitSurface;
        uniform sampler2D vergeMap, detailMap;
        uniform vec4 detailBounds;
        uniform vec3 tarmacTint, gravelTint, vergeTint, redCurb, blueCurb, whiteCurb;`)
      .replace('#include <map_fragment>',`
        float roadEdge = vCircuitSurface.x - ${ROAD_HALF.toFixed(2)};
        float edgeAA = clamp(fwidth(roadEdge) * 0.65, 0.015, 0.4);
        vec3 aggregate = texture2D(map, vMapUv).rgb;
        vec2 groundPoint = vMapUv / 0.27;
        vec2 detailUv = vec2(groundPoint.x - detailBounds.x, detailBounds.y - groundPoint.y) * detailBounds.zw;
        vec3 trackDetail = texture2D(detailMap, detailUv).rgb;
        float asphaltNoise = smoothstep(0.07, 0.26, dot(aggregate, vec3(0.30, 0.59, 0.11)));
        vec3 turf = texture2D(vergeMap, vMapUv * (0.21 / 0.27)).rgb * vergeTint;
        vec3 gravel = mix(vec3(0.43), aggregate, 0.65) * gravelTint;
        vec3 shoulder = mix(gravel, turf, smoothstep(2.7, 3.8, roadEdge));
        vec3 paving = aggregate * tarmacTint * (1.0 - trackDetail.r * mix(0.49, 0.31, asphaltNoise));
        paving = mix(paving, paving * vec3(0.43, 0.46, 0.48), trackDetail.g);
        vec3 surfaceColor = mix(paving, shoulder, smoothstep(-edgeAA, edgeAA, roadEdge));
        float edgeLine = 1.0 - smoothstep(0.075 - edgeAA, 0.075 + edgeAA, abs(roadEdge + 0.16));
        float curb = smoothstep(0.03 - edgeAA, 0.03 + edgeAA, roadEdge)
          * (1.0 - smoothstep(0.77 - edgeAA, 0.77 + edgeAA, roadEdge));
        float stripeAA = clamp(fwidth(vCircuitSurface.y), 0.035, 0.5);
        vec3 curbTint = mix(redCurb, blueCurb, vCircuitSurface.z);
        curbTint = mix(curbTint, whiteCurb, smoothstep(-stripeAA, stripeAA, vCircuitSurface.y));
        float paintCover = 0.96 - (0.09 + trackDetail.b * 0.51) * (1.0 - asphaltNoise * 0.73);
        surfaceColor = mix(surfaceColor, whiteCurb, edgeLine * paintCover);
        diffuseColor.rgb *= mix(surfaceColor, curbTint, curb * paintCover);
      `);
  };
  const floor = new THREE.Mesh(geometry,material);
  floor.receiveShadow = true;
  return floor;
}

function grassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tile = ctx.createImageData(256,256);
  let seed = 67;
  for (let y=0; y<256; y++) for (let x=0; x<256; x++) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const grain = (seed >>> 24)*.30;
    const clump = 9*Math.sin(x*Math.PI/32)*Math.cos(y*Math.PI/64);
    tile.data.set([115+grain+clump,136+grain+clump,95+grain+clump,255],(y*256+x)*4);
  }
  ctx.putImageData(tile,0,0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function addGrandstands(world,group,obstacles) {
  const { box,textPlane } = world;
  const material = (color,metalness=0) => new THREE.MeshStandardMaterial({ color,metalness,roughness:.74 });
  const structure = material(0x697780,.3);
  const concrete = material(0x99938b);
  const roof = material(0x354758,.35);
  const seats = [material(0x286c81),material(0xcc8850),material(0xbfc3bb)];
  const placement = [[-28,115,0,'A'],[-6,115,0,'B'],[16,115,0,'C'],
    [-44,248,Math.PI,'D'],[0,248,Math.PI,'F']];
  for (const [x,z,yaw,section] of placement) {
    const stand = new THREE.Group();
    stand.position.set(x,0,z);
    stand.rotation.y = yaw;
    group.add(stand);
    obstacles.push({ x,z,w:19.2,d:6.9,h:5.3 });
    box(stand,[19.2,.29,6.9],[0,.15,0],concrete);
    for (let row=0; row<7; row++) {
      const y=.26+row*.43, depth=2.78-row*.87;
      box(stand,[19.2,.45,.89],[0,y,depth],concrete);
      for (let column=-16; column<=16; column++) {
        if (Math.abs(column) % 11 < 2) continue;
        const sx=column*.55;
        const seat = seats[(row+Math.floor((column+16)/6))%seats.length];
        box(stand,[.43,.075,.35],[sx,y+.38,depth+.02],seat).castShadow=false;
        box(stand,[.43,.30,.075],[sx,y+.53,depth-.13],seat).castShadow=false;
      }
    }
    for (const post of [-9,-4.5,0,4.5,9]) {
      box(stand,[.16,5.3,.19],[post,2.65,-3],structure);
      box(stand,[.12,.14,5.9],[post,5.02,-.45],structure,[.07,0,0]);
    }
    box(stand,[19.5,.17,6.1],[0,5.17,-.4],roof,[.07,0,0]);
    box(stand,[19.3,.52,.13],[0,.56,3.47],structure);
    box(stand,[19.3,.08,.10],[0,1.04,3.47],structure);
    for (const post of [-9,-6,-3,0,3,6,9]) box(stand,[.065,.56,.065],[post,.81,3.47],structure);
    textPlane(stand,`CONTOUR 67   /   GRANDSTAND ${section}`,7.2,.42,[0,4.8,2.66],[0,0,0],'#f8f5e8','#2b444a');
    batchSharedMeshes(stand);
  }
}

function addTrackKit(group, obstacles) {
  const placements = [
    ['tent', 76, 236, 7.4, 3.5, 7.4, 0, true],
    ['tent', 66, 237, 7.4, 3.5, 7.4, 0, true],
    ...[[-78,129],[-81,183],[81,150],[83,201],[37,241],[-50,238]].map(([x,z]) =>
      ['lamp', x, z, 1.9, 7, 1.9, Math.PI, false]),
  ];
  for (const [,x,z,w,h,d,, solid] of placements) {
    obstacles.push({ x,z,w:solid ? w : .32,d:solid ? d : .32,h });
  }
  return new GLTFLoader().loadAsync('./assets/club/track-kit.glb').then(({scene}) => {
    for (const [name,x,z,w,h,d,yaw] of placements) {
      const source = scene.getObjectByName(name);
      if (!source) continue;
      const prop = source.clone(true);
      prop.position.set(x,0,z);
      prop.scale.set(w,h,d);
      prop.rotation.y = yaw;
      prop.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
      group.add(prop);
    }
    return true;
  }).catch(error => {
    console.warn('Circuit props could not load', error);
    return false;
  });
}

export function createTireEffects(group) {
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
  const smoke = makeTireSmoke(group);
  marks.count = 0;

  return {
    reset() {
      marks.count = cursor = count = elapsed = 0;
      trails.fill(null);
      smoke.reset();
    },
    tick(dt, physics, high, handbrake) {
      const intensity = Math.min(1, Math.abs(physics.slip) * 1.7);
      const skidding = physics.grounded && physics.totalSpeed > 4 &&
        (Math.abs(THREE.MathUtils.radToDeg(physics.slip)) >= ENTRY_ANGLE || handbrake);
      elapsed += dt;
      if (elapsed < .055) return;
      for (let i = 0; i < 2; i++) {
        const contact = skidding ? physics.wheelContact(i ? 3 : 1) : null;
        const last = trails[i];
        trails[i] = contact;
        if (!contact || !last) continue;
        const dx = contact.x - last.x, dz = contact.z - last.z;
        const length = Math.hypot(dx, dz);
        if (length < .12 || length > 2.8) continue;
        matrix.position.set((contact.x + last.x) / 2, (contact.y+last.y)/2+.056, (contact.z + last.z) / 2);
        matrix.rotation.set(-Math.atan2(contact.y-last.y,length),Math.atan2(dx,dz),0,'YXZ');
        matrix.scale.set(.19, 1, length + .055);
        matrix.updateMatrix();
        marks.setMatrixAt(cursor, matrix.matrix);
        cursor = (cursor + 1) % limit;
        count = Math.min(limit, count + 1);
        marks.count = count;
        marks.instanceMatrix.needsUpdate = true;
        if (high && cursor % 3 === 0) smoke.emit(contact,Math.max(.32,intensity));
      }
      smoke.update(elapsed,high);
      elapsed = 0;
    },
  };
}

let tireSmokeTexture;
function smokeTexture() {
  if (tireSmokeTexture) return tireSmokeTexture;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 64;
  const ctx = textureCanvas.getContext('2d');
  const cloud = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  cloud.addColorStop(0, '#fff');
  cloud.addColorStop(.45, '#ffffffa0');
  cloud.addColorStop(1, '#ffffff00');
  ctx.fillStyle = cloud;
  ctx.fillRect(0, 0, 64, 64);
  tireSmokeTexture = new THREE.CanvasTexture(textureCanvas);
  return tireSmokeTexture;
}

function makeTireSmoke(group) {
  const puffs = Array.from({length:24},() => ({ x:0,y:0,z:0,age:Infinity,strength:0 }));
  const corners = new THREE.PlaneGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(corners.index);
  geometry.setAttribute('position',corners.getAttribute('position'));
  geometry.setAttribute('uv',corners.getAttribute('uv'));
  const clouds = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length*4),4).setUsage(THREE.DynamicDrawUsage);
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length),1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('smokeCloud',clouds);
  geometry.setAttribute('smokeOpacity',opacity);
  const material = new THREE.MeshBasicMaterial({ map:smokeTexture(),color:0xc4c4be,transparent:true,depthWrite:false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec4 smokeCloud;
      attribute float smokeOpacity;
      varying float vSmokeOpacity;`).replace('#include <project_vertex>',`
      vec4 mvPosition = modelViewMatrix * vec4(smokeCloud.xyz, 1.0);
      mvPosition.xy += position.xy * smokeCloud.w;
      gl_Position = projectionMatrix * mvPosition;
      vSmokeOpacity = smokeOpacity;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',`#include <common>
      varying float vSmokeOpacity;`).replace('#include <map_fragment>',`#include <map_fragment>
      diffuseColor.a *= vSmokeOpacity;`);
  };
  const mesh = new THREE.Mesh(geometry,material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  group.add(mesh);
  let cursor = 0;

  return {
    reset() {
      cursor = 0;
      for (const puff of puffs) puff.age = Infinity;
      mesh.visible = false;
    },
    emit(point,strength) {
      const puff = puffs[cursor++ % puffs.length];
      Object.assign(puff,{ x:point.x,y:point.y+.21,z:point.z,age:0,strength });
    },
    update(dt,enabled) {
      let count = 0;
      for (const puff of puffs) {
        if (puff.age >= 1.55) continue;
        puff.age += dt;
        if (!enabled || puff.age >= 1.55) continue;
        clouds.setXYZW(count,puff.x+.48*puff.age,puff.y+.48*puff.age,puff.z,.65+1.65*puff.age);
        opacity.setX(count++,puff.strength*.4*(1-puff.age/1.55));
      }
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      if (count) clouds.needsUpdate = opacity.needsUpdate = true;
    },
  };
}
