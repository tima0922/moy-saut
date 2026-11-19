import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkbench } from '../js/workshop-state.js';
import { createServiceOrder, loadServiceOrder, repairHint, saveServiceOrder } from '../js/workshop-order.js';

function actOnHint(bench) {
  const hint=repairHint(bench);
  assert.ok(hint);
  const {action,part}=hint;
  switch (action) {
    case 'part': {
      const step=bench.plan(part);
      assert.ok(bench.operate(part,step.tool,step.moment).ok);
      break;
    }
    case 'fixture': assert.ok(bench.toggleFixture().ok); break;
    case 'measure': assert.ok(bench.inspect(part).ok); break;
    case 'replace': assert.ok(bench.replace(part).ok); break;
    case 'assemble':
    case 'strip': bench.setPhase(action); break;
    case 'verify': assert.ok(bench.test().ok); break;
    default: assert.fail(action);
  }
}

for (const id of ['engine','gearbox','powertrain']) test(id+' order preserves location, repair and fasteners across reloads',()=>{
  const items=new Map();
  const storage={getItem:key=>items.get(key),setItem:(key,value)=>items.set(key,value)};
  let order=createServiceOrder(id);
  assert.equal(order.advance('release'),false);
  const repaired=[];
  for (const entry of order.steps) {
    assert.equal(order.current.id,entry.id);
    if (entry.bench) {
      assert.equal(order.unitLocation(entry.bench),'stand');
      assert.equal(order.advance(entry.id),false);
      let bench=order.bench(entry.bench);
      for (let i=0; i<7; i++) actOnHint(bench);
      saveServiceOrder(storage,order);
      const partial=JSON.parse(JSON.stringify(bench.state));
      order=loadServiceOrder(storage);
      bench=order.bench(entry.bench);
      assert.deepEqual(bench.state,partial);
      for (let i=0; !bench.state.verified && i<200; i++) actOnHint(bench);
      assert.ok(bench.state.verified,'Guided repair must lead to verification');
      repaired.push(entry.bench);
    }
    for (let i=0; i<(entry.count ?? 1); i++) {
      assert.equal(order.state.fastener,i);
      assert.ok(order.advance(entry.id));
      saveServiceOrder(storage,order);
      order=loadServiceOrder(storage);
    }
    const positions={
      'engine-raise':['engine','crane'],'engine-pickup':['engine','crane'],'engine-seat':['engine','installed'],
      'gearbox-lower':['gearbox','jack'],'gearbox-pickup':['gearbox','jack'],'gearbox-seat':['gearbox','installed'],
    };
    if (positions[entry.id]) {
      const [unit,location]=positions[entry.id];
      assert.equal(order.unitLocation(unit),location);
    }
    if (entry.id==='start-test') {
      assert.ok(order.done('power-on'));
      for (const unit of order.spec.units) assert.equal(order.unitLocation(unit),'installed');
    }
  }
  assert.deepEqual(repaired,id==='powertrain' ? ['gearbox','engine'] : [id]);
  assert.equal(order.completed,true);
  assert.equal(order.advance('release'),false);
});

test('a missing bench check in a saved order returns the unit to its stand',()=>{
  const full=createServiceOrder('engine');
  const resumed=createServiceOrder('engine',{index:full.steps.length,fastener:9,benches:{engine:createWorkbench('engine').state}});
  assert.equal(resumed.current.id,'engine-bench');
  assert.equal(resumed.state.fastener,0);
  assert.equal(resumed.unitLocation('engine'),'stand');
});
