import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRAPHICS, createGraphicsController, createMaterialQuality, renderRatio } from '../js/graphics.js';
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
    ['minimum',false,false,260_000], ['performance',false,true,520_000],
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
