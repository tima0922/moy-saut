import * as THREE from 'three';

export const SHOP = { x: 23, z: 29 };
export const TRACK = { x: -21, start: 43, end: 78 };
const gray = (color, roughness = .9) => new THREE.MeshStandardMaterial({ color, roughness });

export function createDistrict(world, renderer) {
  const { scene, box, textPlane, mats, floor } = world;
  const obstacles = [];
  const groups = new Map();
  const concrete = gray(0x8d969a);
  const roof = gray(0x34414a);
  const pale = gray(0x9aabb0);
  const blue = gray(0x466779);
  const rust = gray(0x795952);
  const glass = gray(0x354a55, .4);
  const green = gray(0x566c54);
  const stripe = gray(0xd4d5bc);
  const amber = gray(0xe2ac50);
  const asphalt = gray(0xa7b2ba, .96);
  const loader = new THREE.TextureLoader();
  const tiling = (path, x, z, srgb = true) => {
    const texture = loader.load('./assets/district/' + path);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(x, z);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  asphalt.map = tiling('asphalt.jpg', 23, 28);
  floor.material.map = tiling('floor.jpg', 6, 6);
  floor.material.normalMap = tiling('floor-normal.jpg', 6, 6, false);
  floor.material.roughnessMap = null;
  floor.material.normalScale.set(.38, .38);
  floor.material.needsUpdate = true;

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(108, 132), asphalt);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, -.031, 36);
  surface.receiveShadow = true;
  scene.add(surface);
  scene.fog = new THREE.FogExp2(0xa2b6c4, .0085);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(145, 24, 12), new THREE.ShaderMaterial({
    uniforms: { circuit: { value: 0 } },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float circuit; varying vec3 v; void main() {
      float h=normalize(v).y;
      vec3 dir=normalize(v);
      vec3 c=mix(vec3(.66,.78,.86),vec3(.28,.49,.68),smoothstep(-.06,.66,h));
      vec2 p=dir.xz/max(.18,dir.y);
      float wisps=sin(p.x*2.5+p.y*.8)*cos(p.y*2.9)+.45*sin(p.y*7.1+p.x*4.8);
      float clouds=smoothstep(.6,1.25,wisps)*smoothstep(.08,.32,h)*(1.-smoothstep(.59,.84,h));
      c=mix(c,vec3(.83,.89,.94),clouds*.28);
      vec3 sun=normalize(vec3(-.72,.19,.54));
      float toward=clamp(dot(dir,sun),0.,1.);
      vec3 sunset=mix(vec3(.98,.63,.43),vec3(.15,.27,.47),smoothstep(.01,.64,h));
      sunset+=vec3(.35,.18,.055)*pow(toward,10.);
      sunset=mix(sunset,vec3(1.,.92,.69),smoothstep(.9985,.9992,toward));
      sunset=mix(sunset,vec3(.93,.75,.65),clouds*.48);
      gl_FragColor=vec4(mix(c,sunset,circuit),1.);
    }`,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const sunlight = new THREE.DirectionalLight(0xfff1db, 2.05);
  sunlight.position.set(-24, 32, 36);
  sunlight.target.position.set(0, 0, 23);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, {left:-51,right:51,top:53,bottom:-53,near:.5,far:118});
  sunlight.shadow.normalBias = .045;
  sunlight.shadow.bias = -.00035;
  scene.add(sunlight, sunlight.target);
  world.key.intensity = 2.2;
  world.key.position.set(-5, 8, 2);

  const add = (material, w, h, d, x, y, z) => {
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push([w, h, d, x, y, z]);
  };
  const solid = (x, z, w, d, h) => obstacles.push({ x, z, w, d, h });
  const paint = (material, x, z, w, d) => add(material, w, .008, d, x, -.016, z);

  // Workshop facade and equipment colliders.
  solid(-7, 0, .3, 16, 5.4);
  solid(7, 0, .3, 16, 5.4);
  solid(0, -8, 14, .3, 5.4);
  solid(-4.8, 8, 4.4, .3, 5.4);
  solid(4.8, 8, 4.4, .3, 5.4);
  for (const x of [-2.7, 2.7]) solid(x, .5, .58, .66, 3.6);
  solid(-6.15, 2.7, 1.1, 3, 1.2);
  solid(5.3, -3.35, 2.5, 1.4, 1);
  textPlane(scene, 'GARAGE LIFE', 3.5, .55, [-4.66, 3.1, 8.13], [0, 0, 0], '#f5e9d6');
  textPlane(scene, '01  /  МАСТЕРСКАЯ', 3.25, .27, [4.64, 3, 8.13], [0, 0, 0], '#f0a766');

  // The district is an open forecourt with a separate straight test lane.
  for (const x of [-8, 8]) {
    paint(amber, x, 13, .09, 8);
    add(concrete, .38, .14, 6, x * 1.09, .04, 12);
  }
  add(green, 3.5, .016, 94, -34.1, -.017, 38);
  add(green, 3.5, .016, 94, 34.1, -.017, 38);
  add(concrete, 18, .04, 3.6, 23, -.011, 35);
  add(concrete, 17, .04, 2.2, -4, -.011, 43.7);
  add(concrete, .25, .11, 13, 13, .04, 34);
  for (let x = -29; x <= 29; x += 6) paint(stripe, x, 21, 2.6, .12);
  for (let z = 24; z < 84; z += 6) paint(stripe, 6, z, .12, 2.6);
  for (const x of [TRACK.x - 2.5, TRACK.x + 2.5]) paint(amber, x, 61, .11, 36);
  for (let z = 46; z < 77; z += 4) paint(stripe, TRACK.x, z, .09, 1.3);
  paint(stripe, TRACK.x, TRACK.start, 5, .3);
  for (let i = 0; i < 10; i++) paint(i % 2 ? amber : stripe, TRACK.x - 2.25 + i * .5, TRACK.end, .29, .65);
  for (let i = 0; i < 6; i++) paint(stripe, SHOP.x - 8 + i * 2.7, 33, .08, 5);
  for (let i = 0; i < 5; i++) paint(stripe, 12.5 + i * .55, 23.5, .28, 3.5);

  function warehouse(x, z, w, d, h, material, sign) {
    solid(x, z, w, d, h);
    add(material, w, h, d, x, h / 2, z);
    add(roof, w + .28, .22, d + .28, x, h, z);
    add(concrete, w + .05, .48, d + .05, x, .24, z);
    const face = z - d / 2;
    for (let dx = -w / 2 + 1; dx < w / 2; dx += .55) add(material, .13, h - .55, .14, x + dx, h / 2 + .21, face);
    for (const dx of [-w * .29, w * .29]) {
      add(roof, w * .23, 2.8, .16, x + dx, 1.46, face - .08);
      add(glass, w * .18, .48, .18, x + dx, 2.17, face - .18);
      add(concrete, w * .24, .18, 1.3, x + dx, .08, face - .65);
    }
    if (sign) textPlane(scene, sign, Math.min(w * .7, 7), .57, [x, h - .48, face - .18], [0, Math.PI, 0], '#f1e4c9', '#233744');
  }
  warehouse(23, 41, 17, 9, 5.6, blue, 'KOVA · АВТОЗАПЧАСТИ');
  warehouse(23, 63, 17, 11, 6.4, pale, 'ПРИЁМКА  /  02');
  warehouse(-10, 52, 14, 14, 7, pale, 'СКЛАД  /  01');
  warehouse(-10, 73, 15, 12, 6, rust, 'ПРОМЗОНА · СЕВЕР');
  warehouse(-29, 24, 9, 12, 5, rust, 'ДЕПО');

  function sign(x, z, label) {
    add(roof, .09, 2.5, .09, x, 1.25, z);
    textPlane(scene, label, 3.1, .5, [x, 2.5, z], [0, Math.PI, 0], '#f7e9c6', '#294353');
  }
  sign(TRACK.x - 4.1, 42, 'ТЕСТ-ПОЛОСА');
  sign(SHOP.x, SHOP.z + 1.4, 'ВЫДАЧА ДЕТАЛЕЙ');
  sign(8.3, 13.2, '01 · ГАРАЖ');

  // Perimeter, barriers, planters and poles give the road clear edges.
  for (const x of [-36, 36]) {
    solid(x, 37, .25, 104, 1.4);
    add(concrete, .35, .54, 104, x, .27, 37);
    for (let z = -13; z < 89; z += 4) add(roof, .14, 1.7, .14, x, 1.05, z);
    add(roof, .09, .08, 104, x, 1.84, 37);
    add(roof, .09, .08, 104, x, 1.21, 37);
  }
  for (const [x, z, width] of [[0, -15, 72], [-20.5, 89, 31], [20.5, 89, 31]]) {
    solid(x, z, width, .28, 1.4);
    add(concrete, width, .57, .45, x, .29, z);
    for (let dx = -width / 2 + 1; dx < width / 2; dx += 4) {
      add(roof, .14, 1.3, .14, x + dx, .9, z);
    }
    add(roof, width, .08, .08, x, 1.52, z);
  }
  const pitRoad = new THREE.Mesh(new THREE.PlaneGeometry(11, 29), asphalt.clone());
  pitRoad.material.map = asphalt.map.clone();
  pitRoad.material.map.repeat.set(2.2, 5.8);
  pitRoad.rotation.x = -Math.PI / 2;
  pitRoad.position.set(0, -.021, 114);
  pitRoad.receiveShadow = true;
  scene.add(pitRoad);
  for (const x of [-5.5, 5.5]) {
    solid(x, 103, .30, 27, .95);
    add(concrete, .30, .95, 27, x, .475, 103);
  }
  for (const x of [-4.65, 4.65]) {
    paint(amber, x, 68, .13, 116);
  }
  for (const z of [19, 37, 55, 73, 94, 108]) {
    textPlane(scene, '▲', 1.6, 1.3, [0, .009, z], [-Math.PI / 2, 0, Math.PI], '#e5c080');
  }
  sign(4.45, 24, 'КОНТУР 67  ↑');
  sign(4.45, 82, 'ВЪЕЗД НА ТРАССУ');
  textPlane(scene, 'БОКС 01  ↓', 3.3, .5, [-4.45, 2.5, 80], [0, 0, 0], '#ffe5b5', '#294353');
  for (const [x, z] of [[-11, 12], [11, 13], [-12, 34], [10, 45], [-29, 45], [11, 75], [-29, 76], [31, 25]]) {
    add(concrete, 1.14, .17, 1.14, x, .085, z);
    add(roof, .12, 5.2, .12, x, 2.6, z);
    add(roof, 1.3, .12, .25, x + .53, 5.2, z);
    add(mats.light, .55, .035, .22, x + .87, 5.126, z);
    solid(x, z, .48, .48, 2);
  }
  for (const [x, z] of [[-12, -5], [12, -6], [33, 16], [-33, 48], [32, 82], [-30, 83]]) {
    add(concrete, 2.6, .36, 3, x, .18, z);
    add(green, 2.45, .13, 2.85, x, .39, z);
    solid(x, z, 2.6, 3, .48);
    world.cylinder(scene, .105, .17, 2.3, [x, 1.4, z], mats.rust);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 2), green);
    crown.scale.set(.9, 1.45, 1.05);
    crown.position.set(x, 3.05, z);
    scene.add(crown);
  }
  for (const x of [-18, -15, 15, 18]) {
    add(roof, .34, .11, .34, x, .055, 84);
    add(amber, .13, .73, .13, x, .41, 84);
  }

  const unitBox = new THREE.BoxGeometry();
  const transform = new THREE.Object3D();
  for (const [material, instances] of groups) {
    const mesh = new THREE.InstancedMesh(unitBox, material, instances.length);
    instances.forEach(([w, h, d, x, y, z], index) => {
      transform.position.set(x, y, z);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.receiveShadow = true;
    mesh.castShadow = material !== stripe && material !== amber && material !== mats.light;
    scene.add(mesh);
  }

  const marker = new THREE.Mesh(new THREE.RingGeometry(.32, .38, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb15b, transparent: true, opacity: .82, side: THREE.DoubleSide }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = .025;
  marker.visible = false;
  scene.add(marker);
  return { obstacles, marker, sky, sunlight, asphalt };
}
