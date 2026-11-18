import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRAPHICS, createGraphicsController, createMaterialQuality, renderRatio, useDistantCar } from '../js/graphics.js';
import { Group, Mesh, MeshPhysicalMaterial, Texture } from '../vendor/three/build/three.module.js';

test('desktop Auto responds to severe drops and waits before raising quality', () => {
  const graphics = createGraphicsController('auto', false);
  assert.equal(graphics.level, 'balanced');
  assert.equal(graphics.sample(15), true);
  assert.equal(graphics.level, 'integrated');
  assert.equal(graphics.sample(15), true);
  assert.equal(graphics.level, 'performance');
  assert.equal(graphics.sample(15), true);
  assert.equal(graphics.level, 'minimum');
  for (let i=0; i<19; i++) assert.equal(graphics.sample(60), false);
  assert.equal(graphics.sample(60), true);
  assert.equal(graphics.level, 'performance');
});

test('Auto stays below Ultra and manual Minimum stays selected', () => {
  const graphics = createGraphicsController('auto', true);
  assert.equal(graphics.level, 'performance');
  for (let i=0; i<30; i++) graphics.sample(60);
  assert.equal(graphics.level, 'balanced');
  graphics.setMode('minimum');
  for (let i=0; i<30; i++) assert.equal(graphics.sample(60), false);
  assert.equal(graphics.level, 'minimum');
});

test('render buffer budgets hold on high-DPI, split-screen and mobile views', () => {
  for (const [profile, touch, split, budget] of [
    ['minimum',false,false,518_400], ['performance',false,true,921_600],
    ['ultra',false,true,2_500_000], ['ultra',true,false,750_000],
  ]) {
    const ratio = renderRatio(GRAPHICS[profile],3840,2160,2,touch,split);
    assert.ok(Math.floor(3840*ratio)*Math.floor(2160*ratio) <= budget);
  }
});

test('cheap materials restore detail without replacing tuning colors or guest paint', () => {
  const root = new Group();
  const normalMap = new Texture();
  const paint = new MeshPhysicalMaterial({ color:0x224488, normalMap, clearcoat:.6, metalness:.8 });
  root.add(new Mesh(undefined,paint));
  const quality = createMaterialQuality();
  quality.collect(root);
  quality.apply(true,1);
  assert.equal(paint.normalMap,null);
  assert.equal(paint.clearcoat,0);
  assert.equal(paint.metalness,.25);
  const guestPaint = quality.clone(paint);
  guestPaint.color.setHex(0xff6600);
  quality.apply(false,4);
  assert.equal(paint.normalMap,normalMap);
  assert.equal(guestPaint.normalMap,normalMap);
  assert.equal(guestPaint.clearcoat,.6);
  assert.equal(guestPaint.metalness,.8);
  assert.equal(guestPaint.color.getHex(),0xff6600);
});


test('desktop presets keep their intended render height on a Full HD display', () => {
  for (const [preset, height] of [
    ['balanced',1080], ['integrated',900], ['performance',720], ['minimum',540],
  ]) {
    const scale=renderRatio(GRAPHICS[preset],1920,1080,1,false,false);
    assert.ok(Math.abs(1080*scale-height)<.001,preset);
  }
  assert.equal(renderRatio(GRAPHICS.balanced,1536,864,1.25,false,false),1.25);
});

test('world simplification preserves automotive surface maps and paint finish', () => {
  const root=new Group();
  const carMap=new Texture();
  const paint=new MeshPhysicalMaterial({normalMap:carMap,clearcoat:.8,metalness:.7});
  const roadside=new MeshPhysicalMaterial({normalMap:new Texture(),clearcoat:.5});
  root.add(new Mesh(undefined,paint));
  const quality=createMaterialQuality();
  quality.collect(root,true);
  quality.register(roadside);
  const peer=quality.clone(paint);
  quality.register(peer);
  quality.apply(true,2,8);
  assert.equal(paint.normalMap,carMap);
  assert.equal(carMap.anisotropy,4);
  assert.equal(paint.clearcoat,.8);
  assert.equal(paint.metalness,.7);
  assert.equal(roadside.normalMap,null);
  assert.equal(peer.normalMap,carMap);
  assert.equal(peer.clearcoat,.8);
});

test('nearby opponents stay detailed and the distant model has a stable threshold', () => {
  for (const profile of Object.values(GRAPHICS)) {
    assert.equal(useDistantCar(16**2,profile.remoteDetail ?? Infinity,false),false);
  }
  assert.equal(useDistantCar(42**2,38,false),false);
  assert.equal(useDistantCar(42**2,38,true),true);
  assert.equal(useDistantCar(47**2,38,false),true);
  assert.equal(useDistantCar(120**2,Infinity,true),false);
});
