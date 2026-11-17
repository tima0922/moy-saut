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
const {portCourse,portWorld,portLayout,PORT_GATES,PORT_SPAWN,PORT_SECTORS,PORT_LENGTH,PORT_SPAN} = await import('../js/port.js');
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
  assert.equal(PORT_GATES.length,30);
  assert.equal(PORT_LENGTH,4602);
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

test('all four cars clear the timed harbor course, its branches, and retries with digital steering', async () => {
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
  assert.equal(chunks.length,PORT_GATES.length);
  assert.equal(portLayout().branches.length,3);
  assert.equal(track.obstacles.filter(shape=>shape.motion && !shape.drivable).length,9);
  const ferry = track.obstacles.find(shape=>shape.motion && shape.drivable);
  assert.ok(ferry);
  assert.equal(PORT_SECTORS.filter(sector=>sector.ship).length,3);
  for (const sector of PORT_SECTORS) {
    track.showAround(sector.gate.z,185);
    const near = chunks.filter(chunk=>chunk.visible);
    assert.ok(near.length<=3);
    let drawObjects = 0;
    for (const chunk of near) chunk.traverseVisible(mesh=>{if(mesh.isMesh) drawObjects++;});
    assert.ok(drawObjects<=110,`dock draw-object count ${drawObjects}`);
  }

  const physics = await createPhysics(track.obstacles.map(shape=>({...shape,region:'port'})));
  physics.setRegion('port');
  const pit = loadPit();
  const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
  function routePoints(sector) {
    return [
      [0,sector.previous],[26,sector.x],
      ...(sector.line ?? sector.slalom?.map(([z,side,offset=3.25,width=7])=>
        [z,-side*Math.max(2.72,width/2-offset+1.32)]) ?? []).map(([z,x])=>[z,sector.x+x]),
      [145,sector.x],[PORT_SPAN,sector.x],
    ];
  }
  const guides = PORT_SECTORS.map(routePoints);
  const alternatives = new Map(PORT_SECTORS.flatMap((sector,index)=>sector.alternate ?
    [[index,routePoints({...sector,...sector.alternate})]] : []));
  function targetLane(i,z,alternate) {
    const points = alternate ? alternatives.get(i) : guides[i];
    const local = clamp(z-PORT_SECTORS[i].z,0,PORT_SPAN);
    const next = points.findIndex(([at])=>at>=local);
    if (next===0) return points[0][1];
    const [a,x] = points[next-1], [b,y] = points[next];
    return x+(y-x)*(local-a)/(b-a);
  }

  function controller(alternate=false) {
    let steerError = 0;
    let time = 0, crossing = false;
    return function tick(index,speedCap=Infinity) {
      time+=STEP*1000;
      const {x,z} = physics.position;
      const speed = physics.totalSpeed*3.6;
      const sector = PORT_SECTORS[index];
      const local = z-sector.z;
      const pace = alternate ? sector.alternate.speed : sector.pace?.find(([end])=>local<=end)?.[1] ?? sector.speed;
      const cornerSpeed = local<19 && sector.previous!==sector.x ? Math.min(37,pace) : pace;
      const signal = track.signalNear(z,time);
      if (!signal) crossing=false;
      if (signal?.state==='open' && signal.distance<11 && signal.remaining>2750) crossing=true;
      const brakeSpeed = signal && !crossing
        ? 3.6*Math.sqrt(Math.max(0,4.7*(signal.distance-8))) : Infinity;
      const targetSpeed = Math.min(speedCap,cornerSpeed,brakeSpeed);
      const targetX = targetLane(index,z+6,alternate);
      steerError += clamp((x-targetX)*.21+physics.velocity.x*.205,-.85,.85);
      const turn = Math.abs(steerError)>.5 ? Math.sign(steerError) : 0;
      steerError -= turn;
      physics.tick({occupied:true,gas:speed<targetSpeed,reverse:speed>targetSpeed+(brakeSpeed<cornerSpeed?1.5:3),
        parking:targetSpeed===0 && speed<1.6,turn,portTime:time});
      assert.ok(!physics.trapHit,`timed controller hit a trap at stage ${index+1} (Z ${z.toFixed(1)} · ${JSON.stringify(signal)} · ${time.toFixed(0)})`);
    };
  }

  for (const [id,setup] of Object.entries(pit.cars)) {
    physics.setModel(MODELS[id]);
    physics.setSetup(setupFor(setup));
    const run = portCourse(0);
    physics.reset(PORT_SPAWN.x,PORT_SPAWN.z,PORT_SPAWN.yaw);
    physics.running = true;
    const tick = controller();
    for (let frame=0;frame<56000 && run.elapsed===undefined && physics.position.y>=-3.1;frame++) {
      const index = clamp(Math.floor((physics.position.z-PORT_SECTORS[0].z)/PORT_SPAN),0,PORT_GATES.length-1);
      tick(index);
      run.tick(frame*STEP*1000,physics.position);
    }
    assert.equal(run.next,PORT_GATES.length,`${id} at ${physics.position.toArray()}`);
    assert.ok(Number.isFinite(run.elapsed),id);

    for (let index=1;index<PORT_GATES.length;index++) {
      const previous = PORT_GATES[index-1];
      const gate = PORT_GATES[index];
      const sector = PORT_SECTORS[index];
      for (const alternate of sector.alternate ? [false,true] : [false]) {
        physics.reset(previous.x,previous.z+2.2,PORT_SPAWN.yaw,previous.y);
        physics.running = true;
        const retry = controller(alternate);
        let usedLane = false;
        for (let frame=0;frame<2500 && physics.position.z<gate.z && physics.position.y>=-3.1;frame++) {
          retry(index);
          const {x,z} = physics.position;
          if (z>=sector.z+88 && z<=sector.z+94 && (alternate ? x>sector.x+3.2 : x<sector.x-3.2)) usedLane = true;
        }
        assert.ok(physics.position.z>=gate.z && physics.position.y>-.65 &&
          Math.abs(physics.position.x-gate.x)<=gate.w/2, `${id} · checkpoint ${index+1} · alternate=${alternate} at ${physics.position.toArray()}`);
        if (sector.alternate) assert.ok(usedLane,`${id} · lane ${index+1} · alternate=${alternate} at ${physics.position.toArray()}`);
      }
    }
  }

  const initialBerth = Array.from({length:600},(_,i)=>i*100).find(time=>{
    const next=track.ferryNear(ferry.x,ferry.start-15,time);
    return next.state==='open' && next.remaining>=5800;
  });
  assert.notEqual(initialBerth,undefined);
  for (const [id,setup] of Object.entries(pit.cars)) {
    physics.setModel(MODELS[id]);
    physics.setSetup(setupFor(setup));
    physics.reset(ferry.x,ferry.start-14,PORT_SPAWN.yaw,ferry.top);
    physics.running=true;
    let maxHeight=0;
    for (let frame=0;frame<1330;frame++) {
      const time=initialBerth+STEP*1000*frame;
      const pose=ferry.motion(time);
      const boarding=time-initialBerth<4500 && physics.position.z<ferry.start-1.7;
      const exiting=pose.z>ferry.end-.02 && pose.y<ferry.top;
      const advancing=boarding || exiting;
      const speed=physics.totalSpeed*3.6;
      physics.tick({occupied:true,gas:advancing && speed<19,handbrake:!advancing,portTime:time});
      assert.ok(physics.position.y>0,`${id} dropped from the crane at ${physics.position.toArray()}`);
      assert.equal(physics.trapHit,false,'the platform is a road surface');
      maxHeight=Math.max(maxHeight,physics.position.y);
      if (physics.position.z>=ferry.end+11) break;
    }
    assert.ok(maxHeight>3 && physics.position.z>=ferry.end+11,`${id} must clear the moving gap · ${physics.position.toArray()}`);
  }

  const firstTrap = track.obstacles.find(shape=>shape.motion);
  const closedTime = Array.from({length:80},(_,i)=>i*100).find(time=>
    track.signalNear(firstTrap.z-15,time).state==='closed');
  const openTime = Array.from({length:80},(_,i)=>i*100).find(time=>
    track.signalNear(firstTrap.z-15,time).state==='open');
  assert.notEqual(closedTime,undefined);
  assert.notEqual(openTime,undefined);
  for (const time of [closedTime,openTime]) {
    physics.reset(firstTrap.x,firstTrap.z-14,PORT_SPAWN.yaw);
    physics.running = true;
    let hit = false;
    for (let i=0;i<480 && !hit && physics.position.z<firstTrap.z+5;i++) {
      physics.tick({occupied:true,gas:true,portTime:time});
      hit=physics.trapHit;
    }
    assert.equal(hit,time===closedTime,`the cargo must hit only when it blocks the deck at ${time} · pose ${physics.position.toArray()}`);
    if (time===openTime) assert.ok(physics.position.z>=firstTrap.z+5,'opening clears the entire wheel path');
  }

  const final = PORT_GATES.length-1;
  const previous = PORT_GATES[final-1];
  physics.reset(previous.x,previous.z+2.2,PORT_SPAWN.yaw,previous.y);
  physics.running = true;
  const withoutRunup = controller();
  for (let frame=0;frame<1800 && physics.position.y>=-3.1;frame++) withoutRunup(final,28);
  assert.ok(physics.position.y< -3.1,'the final gap cannot be crossed at walking speed');
});
