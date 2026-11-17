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
const {portCourse,portWorld,PORT_GATES,PORT_SPAWN,PORT_SECTORS,PORT_LENGTH} = await import('../js/port.js');
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

test('port reports a skipped gate and respawns at the last cleared checkpoint', () => {
  const run = portCourse(1000);
  const first = PORT_GATES[0], last = PORT_GATES.at(-1);
  run.tick(1050,{...first,z:first.z-1});
  run.tick(1100,{...first,z:first.z+1});
  run.tick(1200,{...last,z:last.z-1});
  run.tick(1300,{...last,z:last.z+1});
  assert.equal(run.next,1);
  assert.equal(run.missedFinish,true);
  assert.equal(run.elapsed,undefined);
  const checkpoint = run.reset();
  assert.equal(run.missedFinish,false);
  assert.equal(run.resets,1);
  assert.equal(run.next,1);
  assert.ok(checkpoint.z>first.z && checkpoint.z<PORT_GATES[1].z);
});

test('finish counts while crossing the outside curb at suspension height', () => {
  const run = portCourse(1000);
  assert.equal(PORT_GATES.length,10);
  assert.ok(PORT_LENGTH>=1520);
  for (const [i,gate] of PORT_GATES.entries()) {
    const finish = i===PORT_GATES.length-1;
    const x = gate.x+(finish ? gate.w/2+.22 : 0);
    run.tick(2000,{...gate,x,y:gate.y-.3,z:gate.z-1});
    run.tick(2100,{...gate,x,y:gate.y-.3,z:gate.z+1});
  }
  assert.equal(run.next,PORT_GATES.length);
  assert.equal(run.elapsed,1100);
  assert.equal(run.reset(),null);
});

test('all four cars clear the expanded port with digital steering and nearby chunks', async () => {
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
  const chunks = track.group.children.filter(child=>child.isGroup);
  assert.equal(chunks.length,10);
  for (const sector of PORT_SECTORS) {
    track.showAround(sector.gate.z,185);
    assert.ok(chunks.filter(chunk=>chunk.visible).length<=3);
  }

  const physics = await createPhysics(track.obstacles.map(shape=>({...shape,region:'port'})));
  physics.setRegion('port');
  const pit = loadPit();
  const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
  const guides = PORT_SECTORS.map(sector=>[
    [0,sector.previous],[26,sector.x],
    ...(sector.slalom ?? []).map(([z,side])=>[z,sector.x-side*4.05]),
    [132,sector.x],[154,sector.x],
  ]);
  function targetLane(i,z) {
    const points = guides[i];
    const local = clamp(z-PORT_SECTORS[i].z,0,154);
    const next = points.findIndex(([at])=>at>=local);
    if (next===0) return points[0][1];
    const [a,x] = points[next-1], [b,y] = points[next];
    return x+(y-x)*(local-a)/(b-a);
  }
  for (const [id,setup] of Object.entries(pit.cars)) {
    const run = portCourse(0);
    physics.setModel(MODELS[id]);
    physics.setSetup(setupFor(setup));
    physics.reset(PORT_SPAWN.x,PORT_SPAWN.z,PORT_SPAWN.yaw);
    physics.running = true;
    let steerError = 0;
    for (let frame=0;frame<10500 && run.elapsed===undefined;frame++) {
      const {x,z} = physics.position;
      const speed = physics.totalSpeed*3.6;
      const index = clamp(Math.floor((z-PORT_SECTORS[0].z)/154),0,9);
      const sector = PORT_SECTORS[index];
      const targetX = targetLane(index,z+6);
      const targetSpeed = z-sector.z<19 && sector.previous!==sector.x ? Math.min(37,sector.speed) : sector.speed;
      steerError += clamp((x-targetX)*.21+physics.velocity.x*.205,-.85,.85);
      const turn = Math.abs(steerError)>.5 ? Math.sign(steerError) : 0;
      steerError -= turn;
      physics.tick({occupied:true,gas:speed<targetSpeed,reverse:speed>targetSpeed+3,turn});
      run.tick(frame*STEP*1000,physics.position);
    }
    assert.equal(run.next,PORT_GATES.length,id);
    assert.ok(Number.isFinite(run.elapsed),id);
  }
});
