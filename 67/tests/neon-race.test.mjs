import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import {rankRound,RESET_PENALTY} from '../js/competition.js';

const vendor=new URL('../vendor/',import.meta.url);
registerHooks({resolve(specifier,context,next) {
  if (specifier==='three') return next(new URL('three/build/three.module.js',vendor).href,context);
  if (specifier.startsWith('three/addons/')) return next(new URL(specifier,vendor).href,context);
  return next(specifier,context);
}});
const {Vector3,Mesh,BoxGeometry,MeshStandardMaterial,Texture}=await import('three');
const {draftStrength,createRaceCourse,createNeonRun,readRaceBest,saveRaceBest,RACE_LAPS}=await import('../js/neon-race.js');
const {createClubLayout,createShortLayout,CLUB_ARENA}=await import('../js/drift.js');
const {createStadiumLayout,stadiumSurface,STADIUM}=await import('../js/stadium.js');
const {circuitTerrain}=await import('../js/circuit-terrain.js');
const {createPhysics,MODELS,STEP}=await import('../js/vehicle.js');
const contour=createClubLayout();
const stadium=createStadiumLayout();
const {createCityLayout,createCityWorld}=await import('../js/city.js');
const city=createCityLayout();
// Exercise the same geometry, building footprints and bridge pillars used in the browser.
function cityScene() {
  const context={fillRect(){},createRadialGradient(){return {addColorStop(){}};}};
  const original=globalThis.document;
  globalThis.document={createElement(){return {getContext(){return context;}};}};
  try{
    const geometry=new BoxGeometry();
    const world={box(parent,size,pos,paint,rot){
      const m=new Mesh(geometry,paint);
      m.position.set(...pos);m.rotation.set(...rot);m.scale.set(...size);parent.add(m);
      return m;
    },textPlane(){}};
    return createCityWorld(world,city,new MeshStandardMaterial({map:new Texture()}));
  }finally{if(original)globalThis.document=original;else delete globalThis.document;}
}
const cityWorld=cityScene();
const terrain=circuitTerrain(contour,createShortLayout(contour).connector);

test('a race counts three ordered laps, rejects wrong-way and skipped gates, and resets at the last gate',()=>{
  for (const layout of [contour,stadium,city]) {
    const course=createRaceCourse(layout);
    const grid=Array.from({length:4},(_,i)=>course.grid(i));
    for (const spot of grid) assert.ok(course.roadDistance(spot)<7.8**2);
    for (const [i,a] of grid.entries()) for (const b of grid.slice(i+1)) {
      assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=5);
    }
    const run=createNeonRun(course,1000);
    let time=1000;
    const cross=(index,sign=1)=>{
      const {point,dir}=course.gates[index];
      run.tick(time+=50,point.clone().addScaledVector(dir,-sign),true);
      run.tick(time+=50,point.clone().addScaledVector(dir,sign),true);
    };
    cross(0,-1);
    cross(2);
    assert.equal(run.next,0);
    cross(0);
    assert.equal(run.next,1);
    const spawn=run.recover(time);
    assert.equal(run.resets,1);
    assert.ok(Math.hypot(spawn.x-course.gates[0].point.x,spawn.z-course.gates[0].point.z)<4);
    assert.equal(run.next,1);
    for (let i=1;i<course.gates.length;i++) cross(i);
    for (let lap=1;lap<RACE_LAPS;lap++) for (let i=0;i<course.gates.length;i++) cross(i);
    assert.ok(run.elapsed>0);
    assert.equal(run.lap,3);
    assert.equal(run.recover(time),null);
  }
});

test('racing pickups and nitro respect charge, time, and road bounds',()=>{
  const course=createRaceCourse(stadium);
  const run=createNeonRun(course,900);
  assert.equal(run.activate(899),false);
  assert.equal(run.activate(900),true);
  assert.equal(run.activate(1000),false);
  assert.equal(run.charges,0);
  assert.equal(run.boosted(3299),true);
  assert.equal(run.boosted(3300),false);
  for(const [index,{point,kind}] of course.pickups.entries()) {
    const before=run.charges;
    const picked=run.tick(3400+index,point,true);
    if(kind==='nitro' && before<3) assert.equal(picked,'nitro');
    if(kind==='grip') assert.equal(run.grip(4000),true);
  }
  assert.equal(run.charges,3);
  assert.equal(run.tick(6000,new Vector3(1000,0,1000),true),'recover');
});

test('the ranking charges recovery time and records the fastest local lap total per track',()=>{
  const roster=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const results=[{id:'a',value:55000,resets:1,status:'finished'},{id:'b',value:57000,resets:0,status:'finished'},
    {id:'c',value:0,resets:3,status:'dnf'}];
  assert.equal(RESET_PENALTY,3000);
  assert.deepEqual(rankRound({mode:'race',roster,results,finished:true}).slice(0,2).map(row=>row.id),['b','a']);
  const table=new Map();
  const storage={getItem:key=>table.get(key),setItem:(key,value)=>table.set(key,value)};
  assert.equal(readRaceBest(storage,'main'),null);
  assert.equal(saveRaceBest(storage,'main',43000),43000);
  assert.equal(saveRaceBest(storage,'main',47000),43000);
  assert.equal(saveRaceBest(storage,'stadium',39000),39000);
  assert.equal(readRaceBest(storage,'main'),43000);
});

test('the original circuits remain driveable with the new race handling',async()=>{
  const player=await createPhysics([],CLUB_ARENA,undefined,terrain,undefined,{...STADIUM,gripAt:stadiumSurface});
  const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
  const f=new Vector3(0,0,-1);
  for(const layout of [stadium,contour]) {
    const course=createRaceCourse(layout,layout!==contour ? undefined : (x,z)=>terrain.heightAt(x,z));
    const run=createNeonRun(course,0);
    const spawn=course.grid();
    player.reset(spawn.x,spawn.z,spawn.yaw,spawn.y);
    player.running=true;
    let steering=0;
    let before=0;
    for(let frame=0;frame<18000 && run.elapsed===undefined;frame++) {
      const p=player.position, kmh=player.totalSpeed*3.6;
      let index=0, distance=Infinity;
      for(let i=0;i<layout.road.length;i++) {
        const point=layout.road[i];
        const d=(point.x-p.x)**2+(point.z-p.z)**2;
        if(d<distance) {distance=d; index=i;}
      }
      const n=layout.road.length;
      const look=layout.road[(index+Math.round(4+kmh/22))%n];
      const dir=f.set(0,0,-1).applyQuaternion(player.rotation);
      const angle=Math.atan2((look.z-p.z)*dir.x-(look.x-p.x)*dir.z,(look.x-p.x)*dir.x+(look.z-p.z)*dir.z);
      const a=layout.directions[index], b=layout.directions[(index+8)%n];
      const corner=Math.acos(clamp(a.x*b.x+a.z*b.z,-1,1));
      const target=layout.stadium ? 62 : clamp(49-16*corner,29,49);
      steering+=clamp(angle*2.3,-1,1);
      const turn=Math.abs(steering)>.5 ? Math.sign(steering) : 0;
      steering-=turn;
      player.tick({racing:true,occupied:true,gas:kmh<target,reverse:kmh>target+4,turn});
      const update=run.tick(frame*STEP*1000,player.position,player.grounded);
      assert.notEqual(update,'recover',JSON.stringify({track:layout.stadium?'stadium':'main',lap:run.lap,gate:run.next,position:p.toArray(),index,angle}));
      before=frame;
    }
    assert.ok(run.elapsed>0,JSON.stringify({track:layout.stadium?'stadium':'main',lap:run.lap,gate:run.next,before}));
  }
});

test('stock cars turn in promptly at race speed with and without braking',async()=>{
  const player=await createPhysics([],CLUB_ARENA);
  const forward=new Vector3();
  for(const id of ['sedan','f90','cls','supra']){
    player.setModel(MODELS[id]);
    for(const turn of [-1,1]){
      for(const brake of [false,true]){
        player.reset(0,221,0);
        player.running=true;
        for(let i=0;i<40;i++) player.tick({});
        player.applyRoomImpact([0,0,0,-125/3.6]);
        for(let i=0;i<42;i++) player.tick({occupied:true,racing:true,turn,reverse:brake,gas:!brake});
        forward.set(0,0,-1).applyQuaternion(player.rotation);
        const heading=turn*Math.atan2(forward.x,-forward.z);
        assert.ok(heading>(brake ? .43 : .25),`${id}: heading ${heading}`);
        assert.ok(turn*player.position.x>(brake ? 4.5 : 3.5),`${id}: cornering line`);
        assert.ok(player.grounded && Math.abs(player.slip)<.15 && !player.hit,id);
      }
    }
  }
});

test('nitro increases actual acceleration under normal race physics',async()=>{
  const player=await createPhysics([],undefined,undefined,undefined,undefined,{...STADIUM,gripAt:stadiumSurface});
  player.setModel(MODELS.sedan);
  const results=[];
  for (const nitro of [false,true]) {
    player.reset(55,STADIUM.z,Math.PI,0);
    player.running=true;
    for(let i=0;i<110;i++) player.tick({occupied:true,gas:true,nitro});
    results.push(player.totalSpeed);
  }
  assert.ok(results[1]>results[0]*1.18,JSON.stringify(results));
});

test('the lap includes recovery penalties and reversing shows a direction warning',()=>{
  const course=createRaceCourse(city),run=createNeonRun(course,0),p=city.road[0],d=city.directions[0];
  for(let i=0;i<=50;i++) run.tick(i*20,p.clone().addScaledVector(d,-i*.07),true);
  assert.equal(run.wrongWay,true);
  run.recover(1050);
  assert.equal(run.wrongWay,false);
  let t=1100;
  for(const gate of course.gates){
    run.tick(t+=100,gate.point.clone().addScaledVector(gate.dir,-1),true);
    run.tick(t+=100,gate.point.clone().addScaledVector(gate.dir,1),true);
  }
  assert.equal(run.lastLap,t-50+RESET_PENALTY);
  assert.equal(run.bestLap,run.lastLap);
});

test('the slipstream only assists a moving follower in the same lane and direction',()=>{
  const pose=[0,0,12,0,0,0,1,0,20],p={x:0,y:0,z:0},v={x:0,z:20};
  assert.equal(draftStrength(p,v,pose),1);
  for(const wrong of [{x:4,y:0,z:0},{x:0,y:3,z:0},{x:0,y:0,z:15}]) assert.equal(draftStrength(wrong,v,pose),0);
  assert.equal(draftStrength(p,{x:0,z:-20},pose),0);
  assert.equal(draftStrength(p,{x:0,z:3},pose),0);
});


test('all four cars clear three city laps at race pace on the real bridge and barriers',async()=>{
  const driver=await createPhysics([]);
  const empty=driver.activeColliderCount();
  driver.registerRegion('city',cityWorld.obstacles);
  assert.equal(driver.activeColliderCount(),empty);
  driver.setRegion('city');
  assert.ok(driver.activeColliderCount()>empty+300);
  const course=createRaceCourse(city);
  const {road,directions,spacing}=city;
  const count=road.length;
  const curvature=directions.map((_,i)=>{
    const a=directions[(i+count-3)%count],b=directions[(i+3)%count];
    return Math.acos(Math.max(-1,Math.min(1,a.dot(b))))/(6*spacing);
  });
  assert.ok(course.length>=1500);
  assert.ok(Math.max(...road.map(p=>p.y))>7);
  const forward=new Vector3();
  for (const id of ['sedan','f90','cls','supra']) {
    driver.setModel(MODELS[id]);
    const run=createNeonRun(course,0);
    const start=course.grid();
    driver.reset(start.x,start.z,start.yaw,start.y);
    driver.running=true;
    let steeringError=0,turn=0,hint,peak=0;
    for (let frame=0;frame<14400 && run.elapsed===undefined;frame++) {
      const position=driver.position;
      const velocity=driver.totalSpeed;
      const sample=course.project(position,hint);
      hint=sample.nearest;
      const look=road[(hint+Math.round((5.6+velocity*.24)/spacing))%count];
      const heading=forward.set(0,0,-1).applyQuaternion(driver.rotation);
      const dx=look.x-position.x,dz=look.z-position.z;
      const angle=Math.atan2(dz*heading.x-dx*heading.z,dx*heading.x+dz*heading.z);
      let target=195/3.6;
      for (let ahead=1;ahead<=64;ahead+=3) {
        const corner=curvature[(hint+ahead)%count];
        if (corner<.003) continue;
        const approach=Math.max(0,ahead*spacing-8-velocity*.25);
        target=Math.min(target,Math.sqrt(9.4/corner+approach*17.6));
      }
      if (frame%3===0) {
        steeringError+=Math.max(-1,Math.min(1,angle*3.2));
        turn=Math.abs(steeringError)>.5 ? Math.sign(steeringError) : 0;
        steeringError-=turn;
      }
      const time=frame*STEP*1000;
      if (target>45 && velocity>23 && sample.distance<3 && Math.abs(angle)<.08) run.activate(time);
      driver.tick({racing:true,occupied:true,turn,gas:velocity<target,reverse:velocity>target+.6,
        nitro:run.boosted(time),raceGrip:run.grip(time)});
      const event=run.tick(time,driver.position,driver.grounded);
      assert.notEqual(event,'recover',`${id}, lap ${run.lap}, gate ${run.next}`);
      assert.equal(driver.hit,false,`${id} hit a barrier at ${position.toArray()}`);
      peak=Math.max(peak,velocity*3.6);
    }
    assert.ok(run.elapsed>0 && run.elapsed<200_000,id);
    assert.ok(peak>160,`${id} peak ${peak}`);
  }
  driver.setRegion('circuit');
  driver.forgetRegion('city');
  assert.equal(driver.activeColliderCount(),empty);
});

test('each reduced car retains paint and the four independent front/rear wheel assemblies',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {createTrackCar}=await import('../js/track-car.js');
  for (const id of ['sedan','f90','cls','supra']) {
    const asset=await readFile(new URL('../assets/track/'+id+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
    const rig=createTrackCar(scene,id);
    assert.ok(rig.paints.size>0 && rig.brakeLamps);
    assert.ok(rig.wheels.every(wheel=>wheel.children.length>0));
    let triangles=0,meshes=0;
    rig.root.traverse(obj=>{
      if (!obj.isMesh) return;
      triangles+=(obj.geometry.index?.count ?? obj.geometry.attributes.position.count)/3;
      meshes++;
    });
    assert.ok(triangles<23_000 && meshes<35,`${id}: ${triangles} triangles, ${meshes} meshes`);
  }
});

test('a clean start-to-finish lap records a ghost, interpolates its pose and compares sector pace', async () => {
  const { createGhostSession, readRaceGhost, saveRaceGhost, sampleRaceGhost } = await import('../js/race-ghost.js');
  const values = new Map();
  const storage = { getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value) };
  const course = createRaceCourse(stadium), race = createNeonRun(course,0);
  const ghost = createGhostSession('supra',null,clip=>saveRaceGhost(storage,'ring',clip));
  let now=0;
  function cross(index,spacing=130) {
    const {point,dir}=course.gates[index];
    for (const sign of [-1,1]) {
      const p=point.clone().addScaledVector(dir,sign);
      now+=spacing;
      race.tick(now,p,true);
      ghost.tick(now,[p.x,p.y,p.z,0,0,0,1],race.crossing);
    }
  }
  cross(course.gates.length-1);
  assert.equal(race.crossing.sector,0);
  assert.ok(ghost.state.started>0);
  for (let i=0;i<course.gates.length;i++) cross(i);
  const record=readRaceGhost(storage,'ring');
  assert.equal(record.model,'supra');
  assert.equal(record.sectors.length,4);
  assert.equal(record.sectors.at(-1),record.duration);
  assert.ok(Math.abs(sampleRaceGhost(record,0)[0]-course.gates.at(-1).point.x)<.01);
  assert.equal(sampleRaceGhost(record,record.duration+1),null);
  assert.equal(Math.hypot(...sampleRaceGhost(record,record.duration/2).slice(3)),1);
  for (let i=0;i<course.gates.length/4;i++) cross(i,160);
  assert.equal(ghost.state.split.sector,1);
  assert.ok(ghost.state.split.delta>0);
  race.recover(now);
  ghost.reset();
  for (let i=course.gates.length/4;i<course.gates.length;i++) cross(i,80);
  assert.equal(ghost.state.best.duration,record.duration);
  assert.equal(ghost.state.target.duration,record.duration);
});
