import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { eliminationRun,rankRound } from '../js/competition.js';

const vendor = new URL('../vendor/',import.meta.url);
registerHooks({resolve(specifier,context,next) {
  if (specifier==='three') return next(new URL('three/build/three.module.js',vendor).href,context);
  if (specifier.startsWith('three/addons/')) return next(new URL(specifier,vendor).href,context);
  return next(specifier,context);
}});

const {BoxGeometry,Mesh,Scene} = await import('three');
const {portCourse,portWorld,PORT_GATES,PORT_SPAWN} = await import('../js/port.js');
const {MODELS,STEP,createPhysics} = await import('../js/vehicle.js');
const {loadPit,setupFor} = await import('../js/pit-save.js');

test('elimination measures one sustained drift with a short grace interval', () => {
  const run = eliminationRun(1000);
  assert.equal(run.tick(950,{sliding:true}),undefined);
  assert.equal(run.begun,false);
  assert.equal(run.tick(1600,{sliding:true}),undefined);
  assert.equal(run.tick(2100,{sliding:true}),undefined);
  assert.equal(run.tick(2500,{sliding:false}),undefined);
  assert.equal(run.tick(2600,{sliding:false}),500);
  assert.equal(run.tick(2900,{sliding:true}),undefined);
  assert.equal(run.elapsed,500);
  assert.equal(eliminationRun(0).tick(10000,{sliding:false}),0);
});

test('parkour ranking charges three seconds per reset and sorts unfinished players last', () => {
  const roster = ['one','two','three','four'].map(id=>({id,nick:id}));
  const results = [
    {id:'one',status:'finished',value:18000,resets:2},
    {id:'two',status:'finished',value:21000,resets:0},
    {id:'three',status:'dnf',value:0,resets:0},
  ];
  const config = {roster,results,finished:true};
  assert.deepEqual(rankRound({...config,mode:'parkour'}).slice(0,2).map(row=>row.id),['two','one']);
  assert.equal(rankRound({...config,mode:'elimination',winner:'four'})[0].id,'four');
});

test('port gates are directional, sequential and reset from the last cleared checkpoint', () => {
  const run = portCourse(1000);
  const [first,second,third,finish] = PORT_GATES;
  run.tick(1000,{x:second.x,y:second.y,z:second.z-1});
  run.tick(1100,{x:second.x,y:second.y,z:second.z+1});
  assert.equal(run.next,0);
  for (const gate of PORT_GATES.slice(0,3)) {
    run.tick(2000,{...gate,z:gate.z-1});
    run.tick(2100,{...gate,z:gate.z+1});
  }
  const checkpoint = run.reset();
  assert.equal(run.resets,1);
  assert.ok(checkpoint.z<third.z && checkpoint.z>second.z);
  assert.equal(run.next,3);
  run.tick(2500,{...finish,z:finish.z-1});
  run.tick(2600,{...finish,z:finish.z+1});
  assert.equal(run.elapsed,1600);
  assert.equal(run.reset(),null);
  assert.ok(first.z<second.z);
});

test('all four cars clear both ramps and every port checkpoint with stock setups', async () => {
  const savedDocument = globalThis.document;
  globalThis.document = {createElement:()=>({getContext:()=>({
    createRadialGradient:()=>({addColorStop() {}}),fillRect() {},
  })})};
  const geometry = new BoxGeometry();
  const world = {scene:new Scene(),box(group,size,pos,paint,rotation=[0,0,0]) {
    const mesh = new Mesh(geometry,paint);
    mesh.scale.set(...size);
    mesh.position.set(...pos);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  },textPlane() {}};
  let track;
  try { track = portWorld(world); }
  finally { globalThis.document = savedDocument; }
  const physics = await createPhysics(track.obstacles.map(shape=>({...shape,region:'port'})));
  physics.setRegion('port');
  const pit = loadPit();
  const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
  for (const [id,setup] of Object.entries(pit.cars)) {
    const run = portCourse(0);
    physics.setModel(MODELS[id]);
    physics.setSetup(setupFor(setup));
    physics.reset(PORT_SPAWN.x,PORT_SPAWN.z,PORT_SPAWN.yaw);
    physics.running = true;
    for (let frame=0;frame<1600 && run.elapsed===undefined;frame++) {
      const {x,z} = physics.position;
      const speed = physics.totalSpeed*3.6;
      const targetX = 8*clamp((z-620)/13,0,1);
      const targetSpeed = z<558 ? 53 : z<611 ? 40 : z<633 ? 35 : 54;
      const turn = clamp((x-targetX)*.15+physics.velocity.x*.12,-.55,.55);
      physics.tick({occupied:true,gas:speed<targetSpeed,reverse:speed>targetSpeed+3,turn});
      run.tick(frame*STEP*1000,physics.position);
    }
    assert.equal(run.next,PORT_GATES.length,id);
    assert.ok(Number.isFinite(run.elapsed),id);
  }
});
