import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const three = new URL('../vendor/three/build/three.module.js', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? three : specifier, context);
} });

const { ARENA, CLUB_ARENA, RUN_TIME, createClubLayout, createShortLayout, createLayout, createRun, safeCircuitStart } = await import('../js/drift.js');
const { MODELS, STEP, createPhysics } = await import('../js/vehicle.js');
const { advance, loadCareer, makeRoadTest } = await import('../js/career.js');
const { circuitTerrain } = await import('../js/circuit-terrain.js');
const { loadPit, savePit, setupFor } = await import('../js/pit-save.js');
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

test('each car banks a controlled slide on the first bend of Contour 67', async () => {
  const course = createClubLayout();
  const short = createShortLayout(course);
  const car = await createPhysics([],CLUB_ARENA,undefined,circuitTerrain(course,short.connector));
  const pit = loadPit();
  const { Vector3 } = await import('three');
  const heading = new Vector3();
  for (const [id,speed,entry,hold,unwind] of [['sedan',43,34,30,30],['f90',43,37,23,30],['cls',37,34,30,30],['supra',43,34,30,30]]) {
    const session = createRun(course);
    const { x,z,yaw } = course.spawn;
    car.setModel(MODELS[id]);
    car.setSetup(setupFor(pit.cars[id]));
    car.reset(x,z,yaw);
    car.running = true;
    let age = -1;
    let nearest = 0;
    let peak = 0;
    for (let frame=0; frame<850 && nearest<71; frame++) {
      let distance = Infinity;
      for (let index=Math.max(0,nearest-3); index<Math.min(85,nearest+12); index++) {
        const candidate = course.road[index].distanceToSquared(car.position);
        if (candidate < distance) {
          nearest = index;
          distance = candidate;
        }
      }
      if (nearest >= entry || age >= 0) age++;
      heading.set(0,0,-1).applyQuaternion(car.rotation);
      const goal = course.road[Math.min(nearest+4,85)].clone().sub(car.position);
      const error = Math.atan2(goal.z,goal.x) - Math.atan2(heading.z,heading.x);
      const steer = Math.max(-1,Math.min(1,Math.atan2(Math.sin(error),Math.cos(error))*2.5));
      const counterEnd = hold + unwind;
      car.tick({
        occupied: true, drift: true,
        turn: age < 0 || age >= counterEnd ? steer : age < hold ? 1 : -1,
        gas: (age >= 0 && age < counterEnd) || car.speed * 3.6 < speed,
        handbrake: age >= 1 && age < 5,
      });
      tick(session, car.position, {
        speed: car.totalSpeed, slip: car.slip, grounded: car.grounded, hit: car.hit, up: car.up,
      });
      peak = Math.max(peak,session.run.angle);
      if (session.run.next === 1 && session.run.score >= 100) break;
    }
    assert.ok(session.run.score >= 100, `${id}: ${session.run.score} points`);
    assert.equal(session.run.next, 1);
    assert.ok(peak < 60, `${id}: peak drift angle ${peak}`);
  }
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


test('F90 and CLS can enter and catch a slide in either direction', async () => {
  const car = await createPhysics([], ARENA);
  const acceleration = {};
  for (const id of ['f90', 'cls']) {
    car.setModel(MODELS[id]);
    for (const direction of [-1, 1]) {
      car.reset(0, 219, 0);
      car.running = true;
      let start = -1;
      let sliding = 0;
      let peak = 0;
      for (let frame = 0; frame < 460; frame++) {
        if (start === -1 && car.speed * 3.6 >= 43) start = frame;
        const age = start === -1 ? -1 : frame - start;
        car.tick({
          drift: true, occupied: true, gas: age < 103,
          turn: age < 0 ? 0 : age < 44 ? direction : age < 103 ? -direction * .56 : 0,
          handbrake: age >= 4 && age < 24,
        });
        const angle = Math.abs(car.slip) * 180 / Math.PI;
        peak = Math.max(peak, angle);
        if (car.grounded && angle >= 11 && car.totalSpeed * 3.6 >= 22) sliding += STEP;
      }
      assert.ok(peak > 24 && peak < 60, id + ' peak angle ' + peak);
      assert.ok(sliding > 1, id + ' sustained slide');
      assert.ok(Math.abs(car.slip) < .08 && car.up > .9, id + ' recovery');
      acceleration[id] = start;
    }
  }
  assert.ok(acceleration.f90 < acceleration.cls, 'F90 accelerates more quickly');
});

test('the pit lane joins the arena with suspension contact in both directions', async () => {
  const car = await createPhysics([], ARENA);
  for (const [start, yaw, finish] of [[92, Math.PI, 124], [124, 0, 92]]) {
    car.reset(0, start, yaw);
    car.running = true;
    for (let frame = 0; frame < 360; frame++) {
      car.tick({ occupied: true, gas: true, speedLimit: 43 });
      assert.ok(car.position.y > -.35, 'the chassis stays on the pit lane');
      assert.equal(car.hit, false);
      if (Math.abs(car.position.z - start) >= Math.abs(finish - start)) break;
    }
    assert.ok(Math.abs(car.position.z - finish) < 1);
    assert.ok(car.grounded);
  }
});

test('pit saves keep separate tuning and wear per car and import the previous record', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const pit = loadPit(storage, 137);
  assert.equal(pit.cars.sedan.best, 137);
  pit.selected = 'cls';
  Object.assign(pit.cars.cls, { power:1,lock:3,diff:3,pressure:0,tires:0,body:40,brakes:60,shortBest:51 });
  pit.keys[0].gas = 'KeyI';
  savePit(storage, pit);
  const restored = loadPit(storage);
  assert.deepEqual(restored, pit);
  assert.equal(restored.cars.f90.tires, 100);
  const worn = setupFor(restored.cars.cls);
  assert.ok(worn.grip < 1 && worn.brakes < 1);
  assert.deepEqual([worn.steerAngle,worn.diff,worn.pressure],[62,.95,1.8]);
  restored.cars.cls.body = 100;
  assert.ok(setupFor(restored.cars.cls).power > worn.power);
  values.set('garage-life-pit-1', JSON.stringify({ cars:{ sedan:{ lock:1 }, cls:{ lock:0,brakes:70 } } }));
  const migrated = loadPit(storage);
  assert.equal(setupFor(migrated.cars.sedan).steerAngle,57);
  assert.equal(setupFor(migrated.cars.cls).steerAngle,52);
  assert.equal(migrated.cars.cls.brakes,70);
});

test('a pit return banks the score once and an aborted run drops the active chain', () => {
  for (const bank of [true, false]) {
    const session = createRun(layout, { startImmediately: true });
    for (let i = 0; i <= 30; i++) tick(session, layout.road[i]);
    assert.ok(session.run.chain > 0);
    session.finish(bank);
    assert.equal(session.run.status, 'finished');
    assert.equal(session.run.chain, 0);
    assert.equal(session.run.score > 0, bank);
    const score = session.run.score;
    session.finish();
    tick(session, layout.road[31]);
    assert.equal(session.run.score, score);
  }
});

test('a short handbrake tap at 35–45 km/h initiates drift on all four cars', async () => {
  const car = await createPhysics([], { x: 0, z: 180, w: 178, d: 147 });
  for (const id of ['sedan', 'f90', 'cls', 'supra']) {
    car.setModel(MODELS[id]);
    for (const direction of [-1, 1]) {
      for (const targetSpeed of [35, 40, 45]) {
        car.reset(0, 194, 0);
        car.running = true;
        for (let frame = 0; frame < 360 && car.speed * 3.6 < targetSpeed; frame++) {
          car.tick({ occupied: true, drift: true, gas: true });
        }
        assert.ok(car.speed * 3.6 >= targetSpeed);
        let entry;
        for (let frame = 0; frame < 150; frame++) {
          car.tick({
            occupied: true, drift: true, gas: frame < 52,
            turn: frame < 21 ? direction : frame < 52 ? -.5 * direction : 0,
            handbrake: frame < 4,
          });
          if (car.grounded && car.totalSpeed * 3.6 >= 22 && Math.abs(car.slip) >= 11 * Math.PI / 180) {
            entry ??= (frame + 1) * STEP;
          }
        }
        assert.ok(entry <= .52, `${id} at ${targetSpeed} km/h: ${entry}`);
        assert.ok(Math.abs(car.slip) < .08 && car.up > .9);
      }
    }
  }
});

test('the drift camera follows across the angle wrap and returns from a mouse orbit', async () => {
  const { createOrbitCamera } = await import('../js/orbit-camera.js');
  const camera = createOrbitCamera();
  camera.reset(Math.PI - .03);
  const movedCar = camera.tick(-Math.PI + .03, STEP, 0, false);
  assert.ok(movedCar.heading > 3, 'follow the shortest path across the wrap');
  camera.move(240, 60, 1);
  let view;
  for (let frame = 0; frame < 20; frame++) view = camera.tick(-Math.PI + .03, STEP, frame * 16, true);
  assert.ok(Math.abs(view.yaw) > 1 && view.pitch > .15);
  for (let frame = 0; frame < 42; frame++) view = camera.tick(-Math.PI + .03, STEP, 1400 + frame * 16, false);
  assert.ok(Math.abs(view.yaw) < .01 && Math.abs(view.pitch) < .01);
});


test('clipping bonus needs both the painted edge and a valid drift', () => {
  const road = [new (layout.road[0].constructor)(-15,0,0),new (layout.road[0].constructor)(15,0,0),
    new (layout.road[0].constructor)(15,0,24),new (layout.road[0].constructor)(-15,0,24)];
  const gates = [{ position: { x:0,z:0 }, direction: { x:1,z:0 }, clip: { offset:5.7,width:1.7 } }];
  for (const [z,slip,expected] of [[-5.7,.4,1],[5.7,.4,0],[-5.7,0,0]]) {
    const session = createRun({road,gates});
    for (let x=-5; x<3; x+=.18) tick(session,{x,z},{speed:10.8,slip});
    assert.equal(session.run.lap,1);
    assert.equal(session.run.clips,expected);
  }
});

test('two controllers share the sloped surface and advance independently', async () => {
  const course = createClubLayout();
  const terrain = circuitTerrain(course);
  assert.ok(Math.max(...course.road.map(p=>terrain.heightAt(p.x,p.z))) > 3);
  const player = await createPhysics([],CLUB_ARENA,undefined,terrain);
  const guest = player.addCar();
  const { x,z,yaw } = course.spawn;
  player.reset(x,z-2.5,yaw);
  guest.reset(x,z+2.5,yaw);
  player.running = guest.running = true;
  for (let frame=0; frame<130; frame++) player.tick({occupied:true,drift:true},{occupied:true,drift:true,gas:true});
  assert.ok(guest.totalSpeed > 5);
  assert.ok(player.totalSpeed < .3);
  assert.ok(guest.grounded);
  guest.remove();
  for (let frame=0; frame<130; frame++) player.tick({occupied:true,drift:true,gas:true});
  assert.ok(player.totalSpeed > 5);
  assert.ok(player.grounded);
});

test('practice has no clock, starts at the selected clip, and resets to its spawn', async () => {
  const { PRACTICE_PAD, practiceStart } = await import('../js/drift-modes.js');
  const course = createClubLayout();
  const spawn = practiceStart(course,'4');
  const session = createRun(course,{ free:true,startGate:spawn.gate });
  assert.equal(session.run.next,4);
  assert.equal(session.run.time,null);
  for (let frame=0; frame<5500; frame++) tick(session,spawn,{speed:6,slip:0});
  assert.equal(session.run.status,'running');
  assert.equal(session.run.time,null);
  const car = await createPhysics([],CLUB_ARENA,undefined,circuitTerrain(course),PRACTICE_PAD);
  const pad = practiceStart(course,'pad');
  car.reset(pad.x,pad.z,pad.yaw);
  car.running = true;
  for (let frame=0;frame<130;frame++) car.tick({gas:true,occupied:true,drift:true});
  assert.ok(car.grounded && car.totalSpeed>5);
  car.reset(pad.x,pad.z,pad.yaw);
  assert.equal(car.position.x,pad.x);
  assert.equal(car.position.z,pad.z);
  assert.equal(car.totalSpeed,0);
});

test('tandem only rewards a synchronized chase and swaps roles between heats', async () => {
  const { createTandem, tandemMatch } = await import('../js/drift-modes.js');
  const leading = { position:{x:0,z:0}, velocity:{x:12,z:0}, up:1, slip:.5, sliding:true };
  const chasing = { ...leading, position:{x:-5,z:.6} };
  assert.ok(tandemMatch(leading,chasing)>.8);
  assert.equal(tandemMatch(leading,{...chasing,slip:-.5}),0);
  assert.equal(tandemMatch(leading,{...chasing,position:{x:5,z:0}}),0);
  const tandem = createTandem();
  for (let i=0;i<30;i++) tandem.tick(STEP,[leading,chasing]);
  assert.ok(tandem.pending>0);
  tandem.tick(STEP,[leading,{...chasing,hit:true}]);
  assert.equal(tandem.pending,0);
  for (let i=0;i<60;i++) tandem.tick(STEP,[leading,chasing]);
  assert.ok(tandem.closeHeat([90,100]));
  assert.equal(tandem.leader,1);
  assert.equal(tandem.heat,2);
  assert.ok(tandem.bonus[1]>0);
  assert.equal(tandem.bonus[0],0);
  for (let i=0;i<60;i++) tandem.tick(STEP,[chasing,leading]);
  assert.equal(tandem.closeHeat([120,110]),false);
  assert.ok(tandem.done && tandem.bonus[0]>0);
  assert.deepEqual(tandem.totals,[210,210]);
});

test('replay retains the best banked chain and ignores lost or smaller chains', async () => {
  const { createReplayRecorder } = await import('../js/drift-replay.js');
  const { Vector3, Quaternion } = await import('three');
  const recorder = createReplayRecorder();
  const physics = { position:new Vector3(), rotation:new Quaternion(), totalSpeed:10, rpm:3000 };
  const run = { chain:10, sliding:true, status:'running', events:[] };
  const drive = () => {
    run.sliding = true;
    for (let i=0;i<35;i++) {
      physics.position.x+=.5;
      recorder.tick(.05,physics,run);
    }
    run.sliding = false;
  };
  drive();
  run.events.push({id:1,kind:'loss',points:200});
  recorder.tick(0,physics,run);
  assert.equal(recorder.best,null);
  drive();
  run.events.push({id:2,kind:'bank',points:88});
  recorder.tick(0,physics,run);
  assert.equal(recorder.best.points,88);
  drive();
  run.events.push({id:3,kind:'bank',points:30});
  recorder.tick(0,physics,run);
  assert.equal(recorder.best.points,88);
});

test('contact between local cars is reported to both drivers', async () => {
  const first = await createPhysics([],CLUB_ARENA);
  const second = first.addCar();
  first.reset(-7,180,-Math.PI/2);
  second.reset(0,180,-Math.PI/2);
  first.running = second.running = true;
  let sharedContact = false;
  for (let i=0; i<180; i++) {
    first.tick({gas:true,occupied:true,drift:true},{occupied:true,drift:true});
    if (first.hit && second.hit) {
      sharedContact = true;
      break;
    }
  }
  assert.ok(sharedContact);
});

test('the short loop shares the long track and its asphalt shortcut has a continuous grade', () => {
  const main = createClubLayout();
  const short = createShortLayout(main);
  const terrain = circuitTerrain(main,short.connector);
  assert.ok(short.road.length < main.road.length * .6);
  assert.ok(short.gates.length >= 3 && short.gates.every(gate => short.road.includes(gate.position)));
  assert.equal(short.connector.at(-1),short.road[0]);
  const heights = short.connector.map(p => terrain.heightAt(p.x,p.z));
  assert.ok(heights.at(-1)-heights[0] > 3);
  for (const [i,p] of short.connector.entries()) {
    assert.ok(Number.isFinite(heights[i]));
    assert.ok(!i || Math.abs(heights[i]-heights[i-1]) < .85);
    assert.ok(terrain.gripAt(p.x,p.z) > .98);
  }
  assert.equal(terrain.surface.length,terrain.vertices.length);
  const curbStyles = new Set();
  for (let i=0; i<terrain.surface.length; i+=3) {
    const [distance,pattern,branch] = terrain.surface.subarray(i,i+3);
    assert.ok(Number.isFinite(distance) && Math.abs(pattern)<=1);
    if (distance>=7.82 && distance<=8.62) {
      assert.ok(terrain.curbAt(terrain.vertices[i],terrain.vertices[i+2]));
      curbStyles.add(branch);
    }
  }
  assert.deepEqual(curbStyles,new Set([0,1]));
});

test('banked sections and joins contain no abrupt ramps under the tyres', () => {
  const course = createClubLayout();
  const terrain = circuitTerrain(course,createShortLayout(course).connector);
  const cols = Math.ceil(course.arena.w)+1;
  for (let i=0; i<terrain.vertices.length; i+=3) {
    if (terrain.surface[i] > 8.5) continue;
    for (const j of [i% (cols*3) === (cols-1)*3 ? -1 : i+3,i+cols*3]) {
      if (j<0 || j>=terrain.vertices.length) continue;
      assert.ok(Math.abs(terrain.vertices[i+1]-terrain.vertices[j+1])<.18);
    }
  }
});

test('drift suspension raycasts contact the road below trackside props', async () => {
  const car = await createPhysics([{x:.77,z:178.48,w:.5,d:.5,h:.25}],CLUB_ARENA);
  car.reset(0,180,0);
  car.running = true;
  for (let i=0; i<45; i++) car.tick({occupied:true,drift:true});
  const frontRight = car.wheelContact(2);
  assert.ok(frontRight && Math.abs(frontRight.y)<.015);
  assert.ok(car.grounded && !car.hit);
});

test('a personal recovery finds clear asphalt and keeps the timer and banked points', () => {
  const short = createShortLayout(createClubLayout());
  const other = short.road[20];
  const start = safeCircuitStart(short,other,other);
  assert.ok(Math.hypot(start.x-other.x,start.z-other.z) >= 9);
  const run = createRun(short,{ startImmediately:true });
  run.run.score = 200;
  run.run.chain = 25;
  run.run.next = 1;
  run.recover();
  assert.deepEqual([run.run.time,run.run.score,run.run.chain,run.run.next,run.run.status],[90,200,0,1,'running']);
});

test('ghost mode removes only car-to-car contact and leaves walls solid', async () => {
  const first = await createPhysics([{ x:12,z:180,w:.35,d:10,h:2 }],CLUB_ARENA);
  const second = first.addCar();
  first.setCarContacts(false);
  first.reset(-7,180,-Math.PI/2);
  second.reset(0,180,-Math.PI/2);
  first.running = second.running = true;
  let wallHit = false;
  for (let i=0; i<240; i++) {
    first.tick({ gas:true,occupied:true,drift:true },{ occupied:true,drift:true });
    assert.equal(second.hit,false);
    assert.ok(Math.abs(second.position.x) < .1);
    if (first.hit) {
      assert.ok(first.position.x > 8);
      wallHit = true;
      break;
    }
  }
  assert.ok(wallHit);
});

test('all default drift setups can link opposite angles and straighten when the gas is released', async () => {
  const { PRACTICE_PAD } = await import('../js/drift-modes.js');
  const main = createClubLayout();
  const terrain = circuitTerrain(main,createShortLayout(main).connector);
  const car = await createPhysics([],CLUB_ARENA,undefined,terrain,{ ...PRACTICE_PAD,d:110 });
  const pit = loadPit();
  const drive = (turn,gas,handbrake=false) => car.tick({ occupied:true,drift:true,turn,gas,handbrake });
  for (const id of ['sedan','f90','cls']) {
    car.setModel(MODELS[id]);
    car.setSetup(setupFor(pit.cars[id]));
    car.reset(PRACTICE_PAD.x,PRACTICE_PAD.z+18,0);
    car.running = true;
    for (let i=0; i<300 && car.totalSpeed*3.6<38; i++) drive(0,true);
    for (let i=0; i<34; i++) drive(1,true,i<4);
    assert.ok(car.slip<-.19, id);
    for (let i=0; i<90 && car.slip<.23; i++) drive(-1,true);
    assert.ok(car.slip>=.23 && car.grounded, id);
    for (let i=0; i<140; i++) drive(0,false);
    assert.ok(Math.abs(car.slip)<.08 && car.up>.9 && car.grounded && car.totalSpeed>6, id);
  }
});
