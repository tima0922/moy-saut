import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
import { STATIONS } from '../js/workshop-spec.js';
import { createWorkbench, loadBench, saveBench } from '../js/workshop-state.js';

function workThrough(bench, done) {
  for (let i=0;i<420 && !done();i++) {
    const part=bench.spec.parts.find(candidate=>bench.plan(candidate.id).ok);
    if (!part) {
      const fixture=bench.toggleFixture();
      assert.ok(fixture.ok,fixture.message);
      continue;
    }
    const operation=bench.plan(part.id);
    const result=bench.operate(part.id,operation.tool,operation.moment);
    assert.ok(result.ok,result.message);
  }
  assert.ok(done(),'All reachable parts must be serviced');
}

for (const [id,spec] of Object.entries(STATIONS)) {
  test(`${id}: all removable parts can be diagnosed, restored and checked after an autosave`,()=>{
    const data=new Map();
    const storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
    let bench=createWorkbench(id);
    assert.equal(bench.test().ok,false);
    assert.equal(bench.fixturePlan().ok,false);
    assert.equal(bench.inspect(spec.fault).ok,false);
    workThrough(bench,()=>spec.parts.every(part=>!bench.state.parts[part.id].mounted));
    assert.equal(bench.state.locked,true);
    assert.equal(bench.replace(spec.fault).ok,false);
    assert.equal(bench.inspect(spec.fault).message,spec.parts.find(part=>part.id===spec.fault).measurement.bad);
    assert.equal(bench.replace(spec.fault).ok,true);
    saveBench(storage,id,bench.state);
    bench=createWorkbench(id,loadBench(storage,id));
    assert.equal(bench.state.parts[spec.fault].replaced,true);
    assert.equal(bench.state.locked,true);
    assert.equal(bench.fixturePlan().ok,false);
    bench.setPhase('assemble');
    workThrough(bench,()=>spec.parts.every(bench.secure));
    assert.deepEqual(bench.test(),{ok:true,message:spec.result});
    saveBench(storage,id,bench.state);
    assert.equal(createWorkbench(id,loadBench(storage,id)).state.verified,true);
    assert.equal(loadBench(storage,id==='engine' ? 'gearbox' : 'engine'),null);
  });
}

test('cylinder-head fasteners require ordered passes and reject out-of-tolerance torque',()=>{
  const bench=createWorkbench('engine');
  workThrough(bench,()=>!bench.state.parts.head.mounted);
  bench.setPhase('assemble');
  const next=bench.plan('head');
  assert.equal(next.action,'install');
  assert.equal(bench.operate('head','hands').ok,true);
  const spec=bench.parts.get('head');
  for (const stage of [1,2]) for (const index of spec.order) {
    const step=bench.plan('head');
    assert.equal(step.stage,stage);
    assert.equal(step.index,index);
    assert.equal(bench.operate('head','torque',4).ok,false);
    assert.equal(bench.operate('head','torque',step.moment).ok,true);
  }
  assert.equal(bench.secure(spec),true);
});

test('all workbench inventory nodes have independently removable model geometry and matching bolts', async()=>{
  const three=new URL('../vendor/three/build/three.module.js',import.meta.url).href;
  registerHooks({resolve(specifier,context,next) {
    return next(specifier==='three' ? three : specifier,context);
  }});
  const {buildWorkshopModel}=await import('../js/workshop-models.js');
  for(const spec of Object.values(STATIONS)) {
    const model=buildWorkshopModel(spec);
    assert.equal(model.items.size,spec.parts.length);
    for(const part of spec.parts) {
      const item=model.items.get(part.id);
      assert.equal(item.group.userData.partId,part.id);
      assert.ok(!item.bounds.isEmpty(),part.id);
      assert.equal(item.bolts.length,part.bolts);
    }
  }
});
