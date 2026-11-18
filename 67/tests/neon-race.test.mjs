import assert from 'node:assert/strict';
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
    assert.ok(Math.hypot(spawn.x-course.gates[0].point.x,spawn.z-course.gates[0].point.z)<3);
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

test('a physical car completes the race on all three circuits with race handling',async()=>{
  const player=await createPhysics(cityWorld.obstacles,CLUB_ARENA,undefined,terrain,undefined,{...STADIUM,gripAt:stadiumSurface});
  const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
  const f=new Vector3(0,0,-1);
  for(const layout of [stadium,contour,city]) {
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
      const target=layout.city ? clamp(76-36*corner,35,76) : layout.stadium ? 62 : clamp(49-16*corner,29,49);
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
  assert.equal(run.lastLap,t+RESET_PENALTY);
  assert.equal(run.bestLap,run.lastLap);
});

test('the slipstream only assists a moving follower in the same lane and direction',()=>{
  const pose=[0,0,12,0,0,0,1,0,20],p={x:0,y:0,z:0},v={x:0,z:20};
  assert.equal(draftStrength(p,v,pose),1);
  for(const wrong of [{x:4,y:0,z:0},{x:0,y:3,z:0},{x:0,y:0,z:15}]) assert.equal(draftStrength(wrong,v,pose),0);
  assert.equal(draftStrength(p,{x:0,z:-20},pose),0);
  assert.equal(draftStrength(p,{x:0,z:3},pose),0);
});
