import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const three = new URL('../vendor/three/build/three.module.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? three : specifier, context);
} });

const { ARENA, RUN_TIME, createLayout, createRun } = await import('../js/drift.js');
const { STEP, createPhysics } = await import('../js/vehicle.js');
const { advance, loadCareer, makeRoadTest } = await import('../js/career.js');
const layout = createLayout();
const physics = await createPhysics([{ x: 0, z: 146, w: 105, d: .3, h: 1.5 }], ARENA);

function drive(options) {
  physics.tick({ occupied: true, gateY: 6, ...options });
}

test('A and D produce mirrored left and right trajectories at both spawn headings', () => {
  for (const heading of [0, Math.PI]) {
    for (const turn of [-1, 1]) {
      physics.reset(0, 0, heading);
      physics.running = true;
      for (let i = 0; i < 120; i++) drive({ gas: true, turn: i < 70 ? 0 : turn });
      assert.ok(physics.position.x * turn * Math.cos(heading) > 1);
      assert.ok(physics.speed > 5);
    }
  }
});

test('handbrake initiates a sustained left or right slide and countersteer recovers grip', () => {
  for (const turn of [-1, 1]) {
    physics.reset(0, 218, 0);
    physics.running = true;
    let peakAngle = 0;
    let scored = 0;
    for (let i = 0; i < 400; i++) {
      drive({
        drift: true, gas: i < 285,
        turn: i < 190 ? 0 : i < 235 ? turn : i < 285 ? -turn * .56 : 0,
        handbrake: i >= 194 && i < 215,
      });
      const angle = Math.abs(physics.slip) * 180 / Math.PI;
      peakAngle = Math.max(peakAngle, angle);
      if (physics.totalSpeed * 3.6 >= 22 && angle >= 11 && physics.grounded) scored += STEP;
      assert.equal(physics.hit, false);
    }
    assert.ok(peakAngle > 25 && peakAngle < 65, `peak angle: ${peakAngle}`);
    assert.ok(scored > 1, `sliding for ${scored} seconds`);
    assert.ok(Math.abs(physics.slip) < .08);
    assert.ok(physics.up > .9);
  }
});

test('a keyboard drift on the first bend banks points and clears its first gate', async () => {
  const course = await createPhysics([], ARENA);
  const session = createRun(layout);
  const { x, z, yaw } = layout.spawn;
  course.reset(x, z, yaw);
  course.running = true;
  for (let frame = 0; frame < 341; frame++) {
    course.tick({
      occupied: true, drift: true, gas: frame < 296,
      turn: frame < 185 ? 0 : frame < 224 ? 1 : frame < 296 ? -1 : 0,
      handbrake: frame >= 191 && frame < 215,
    });
    tick(session, course.position, {
      speed: course.totalSpeed, slip: course.slip,
      grounded: course.grounded, hit: course.hit, up: course.up,
    });
  }
  assert.ok(session.run.score >= 25);
  assert.equal(session.run.next, 1);
  assert.equal(session.run.warning, '');
});

test('collisions are reported, and restarting clears speed, slip and collision state', () => {
  physics.reset(0, 157, 0);
  physics.running = true;
  let hit = false;
  for (let i = 0; i < 240 && !hit; i++) {
    drive({ drift: true, gas: true });
    hit = physics.hit;
  }
  assert.equal(hit, true);
  const { x, z, yaw } = layout.spawn;
  physics.reset(x, z, yaw);
  assert.equal(physics.totalSpeed, 0);
  assert.equal(physics.slip, 0);
  assert.equal(physics.hit, false);
  assert.equal(physics.running, false);
  assert.ok(Math.abs(physics.position.x - x) < .001 && Math.abs(physics.position.z - z) < .001);
});

test('service brake still passes the workshop road test and reverse needs a fresh press', () => {
  const track = { x: -21, start: 43, end: 78 };
  const check = makeRoadTest('brakes', track);
  physics.reset(track.x, track.start - 11, Math.PI);
  physics.running = true;
  for (let i = 0; i < 240 && physics.speed * 3.6 < 33; i++) drive({ gas: true });
  assert.ok(physics.speed * 3.6 >= 33);
  let result;
  for (let i = 0; i < 180; i++) {
    drive({ reverse: true });
    result ??= check({
      x: physics.position.x, z: physics.position.z, heading: 1, speed: physics.speed * 3.6,
      totalSpeed: physics.totalSpeed, service: true,
    });
  }
  assert.ok(result?.pass, JSON.stringify(result));
  assert.ok(Math.abs(physics.speed) < .1);
  drive({});
  for (let i = 0; i < 60; i++) drive({ reverse: true });
  assert.ok(physics.speed < -.5);
});

test('an old career save keeps its repair phase and gets a fresh drift record', () => {
  const save = loadCareer({ getItem: () => JSON.stringify({ completed: 2, money: 700, phase: 'repair' }) });
  assert.equal(save.completed, 2);
  assert.equal(save.money, 700);
  assert.equal(save.driftBest, 0);
  assert.equal(advance(save, 'repair'), true);
  assert.equal(save.phase, 'verify');
});

function tick(session, position, extra = {}) {
  session.tick(STEP, { position, speed: 12, slip: .43, grounded: true, hit: false, up: 1, ...extra });
}

test('scores a clean slide, loses an unbanked chain on impact, and stops after 90 seconds', () => {
  const session = createRun(layout);
  const { run } = session;
  tick(session, layout.road[0], { speed: 0 });
  assert.equal(run.time, RUN_TIME);
  for (let i = 0; i <= 30; i++) tick(session, layout.road[i]);
  assert.ok(run.chain > 0 && run.sliding);
  tick(session, layout.road[31], { hit: true });
  assert.equal(run.chain, 0);
  assert.equal(run.score, 0);
  for (let i = 32; i < 180; i++) tick(session, layout.road[i]);
  assert.ok(run.chain > 0);
  assert.ok(run.multiplier >= 2);
  for (let i = 180; i < 216; i++) tick(session, layout.road[i % layout.road.length], { slip: 0 });
  assert.ok(run.score > 0);
  assert.equal(run.chain, 0);
  while (run.time > 0) tick(session, layout.road[6], { speed: 0, slip: 0 });
  assert.equal(run.status, 'finished');
  const score = run.score;
  for (let i = 0; i < 180; i++) tick(session, layout.road[i]);
  assert.equal(run.score, score);
});

test('track gates only advance in the correct direction and order', () => {
  const session = createRun(layout);
  const { run } = session;
  for (let i = 46; i >= 0; i--) tick(session, layout.road[i], { slip: 0 });
  assert.equal(run.next, 0);
  for (const p of [...layout.road, ...layout.road.slice(0, 2)]) tick(session, p, { slip: 0 });
  assert.equal(run.next, 0);
  assert.equal(run.lap, 1);
});

test('leaving the track or spinning cancels points in the current chain', () => {
  for (const [position, input, warning] of [
    [{ x: 0, z: ARENA.z }, {}, 'За разметкой'],
    [layout.road[31], { slip: 1.4 }, 'Разворот'],
  ]) {
    const session = createRun(layout);
    for (let i = 0; i <= 30; i++) tick(session, layout.road[i]);
    assert.ok(session.run.chain > 0);
    tick(session, position, input);
    assert.equal(session.run.chain, 0);
    assert.equal(session.run.warning, warning);
  }
});
