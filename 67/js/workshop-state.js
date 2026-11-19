import { STATIONS } from './workshop-spec.js';

const keyFor = id => 'garage-life-workbench-1-'+id;
export const torqueStages = part => part.bolts ? [].concat(part.torque) : [];
const fastenerCount = part => part.bolts*torqueStages(part).length;
const orderFor = part => part.order ?? Array.from({length:part.bolts},(_,i)=>i);
const ok = message => ({ok:true,message});
const failure = (message,blocker) => ({ok:false,message,blocker});

export function loadBench(storage,id) {
  try {
    return JSON.parse(storage?.getItem(keyFor(id)) ?? 'null');
  } catch {
    return null;
  }
}

export function saveBench(storage,id,state) {
  try {
    storage?.setItem(keyFor(id),JSON.stringify(state));
  } catch {
    // Keep the current workbench usable when browser storage is unavailable.
  }
}

export function createWorkbench(id,snapshot) {
  const spec = STATIONS[id];
  const parts = new Map(spec.parts.map(part=>[part.id,part]));
  const below = new Map(spec.parts.map(part=>[part.id,spec.parts.filter(other=>other.blockedBy.includes(part.id))]));
  const state = {
    phase:snapshot?.phase==='assemble' ? 'assemble' : 'strip',
    locked:Boolean(snapshot?.locked), verified:false,
    parts:Object.fromEntries(spec.parts.map(part=>{
      const old = snapshot?.parts?.[part.id];
      const mounted = old?.mounted!==false;
      return [part.id,{
        mounted,
        fastened:mounted ? Math.min(fastenerCount(part),Number.isInteger(old?.fastened) && old.fastened>=0
          ? old.fastened : fastenerCount(part)) : 0,
        measured:Boolean(old?.measured),
        replaced:part.id===spec.fault && Boolean(old?.measured && old?.replaced),
      }];
    })),
  };
  const secure = part => state.parts[part.id].mounted && state.parts[part.id].fastened===fastenerCount(part);
  const firstMissing = ids => ids.find(id=>!secure(parts.get(id)));
  const firstMounted = ids => ids.find(id=>state.parts[id].mounted);
  if (state.locked && firstMounted(spec.fixture.access)) state.locked=false;
  state.verified=Boolean(snapshot?.verified && !state.locked && !firstMissing([...parts.keys()]) && state.parts[spec.fault].replaced);

  function fixturePlan() {
    const blocker = state.locked ? firstMissing(spec.fixture.restore) : firstMounted(spec.fixture.access);
    if (blocker) return failure(state.locked ? 'Сначала собери: '+parts.get(blocker).name+'.'
      : 'Освободи доступ: '+parts.get(blocker).name+'.',blocker);
    return {ok:true,action:'fixture',tool:'fixture',label:state.locked ? spec.fixture.release : spec.fixture.engage};
  }

  function plan(id,phase=state.phase) {
    const part=parts.get(id), node=state.parts[id];
    if (!part) return failure('Выбери деталь.');
    if (phase==='strip' && !node.mounted) return failure('Деталь уже на лотке.');
    if (phase==='assemble' && secure(part)) return failure('Деталь установлена и закреплена.');
    if (phase==='strip') {
      const blocker=firstMounted(part.blockedBy);
      if (blocker) return failure('Сначала сними: '+parts.get(blocker).name+'.',blocker);
    } else {
      const blocker=below.get(id).find(other=>!secure(other));
      if (blocker) return failure('Сначала установи и закрепи: '+blocker.name+'.',blocker.id);
      if (state.locked && spec.fixture.access.includes(id)) return failure('Сначала освободи фиксатор стенда.');
    }
    if (part.fixture && !state.locked) return failure('Нужен фиксатор стенда.');
    if (phase==='strip') {
      const left=Math.min(part.bolts,node.fastened);
      if (!left) return {ok:true,action:'remove',tool:'hands',label:'Снять деталь'};
      const index=orderFor(part)[left-1];
      return {ok:true,action:'loosen',tool:'ratchet',label:`Открутить болт ${index+1}`,index,left};
    }
    if (!node.mounted) return {ok:true,action:'install',tool:'hands',label:'Установить деталь'};
    const moments=torqueStages(part);
    const stage=Math.floor(node.fastened/part.bolts);
    const index=orderFor(part)[node.fastened%part.bolts];
    return {ok:true,action:'tighten',tool:'torque',label:`Затянуть болт ${index+1}`,index,
      stage:stage+1,stages:moments.length,moment:moments[stage]};
  }

  function operate(id,tool,moment) {
    const step=plan(id);
    if (!step.ok) return step;
    if (tool!==step.tool) return {...failure('Выбери подходящий инструмент.'),tool:step.tool};
    if (step.action==='tighten' && (!Number.isFinite(moment) || Math.abs(moment-step.moment)>Math.max(1,step.moment*.07))) {
      return failure('Момент вне допуска. Выставь '+step.moment+' Н·м на ключе стенда.');
    }
    const node=state.parts[id], part=parts.get(id);
    state.verified=false;
    switch (step.action) {
      case 'loosen':
        node.fastened=step.left-1;
        return ok('Болт '+(step.index+1)+' снят.');
      case 'remove':
        node.mounted=false;
        return ok(part.name+' — на лотке.');
      case 'install':
        node.mounted=true;
        return ok(part.bolts ? 'Деталь на месте. Закрепи её.' : 'Деталь установлена.');
      case 'tighten':
        node.fastened++;
        return ok(secure(part) ? 'Крепёж затянут.' : 'Болт '+(step.index+1)+' затянут.');
    }
  }

  function inspect(id) {
    const node=state.parts[id];
    if (!node || node.mounted) return failure('Сними деталь, чтобы измерить её на стенде.');
    node.measured=true;
    return ok(inspection(id));
  }

  function inspection(id) {
    const part=parts.get(id), node=state.parts[id];
    if (!node?.measured) return null;
    const gauge=part.measurement;
    return id===spec.fault && !node.replaced ? gauge.bad : gauge?.ok ?? 'Износ в пределах допуска стенда.';
  }

  function replace(id) {
    const node=state.parts[id];
    if (id!==spec.fault || node.mounted || !node.measured || node.replaced) return failure('Замена доступна для снятой детали с подтверждённым дефектом.');
    node.replaced=true;
    return ok('На лотке новая деталь. Установи её при сборке.');
  }

  return {
    spec,state,parts,secure,plan,operate,inspect,inspection,replace,fixturePlan,
    toggleFixture() {
      const action=fixturePlan();
      if (!action.ok) return action;
      state.locked=!state.locked;
      state.verified=false;
      return ok(state.locked ? spec.fixture.locked : 'Фиксатор освобождён.');
    },
    setPhase(phase) {
      if (phase==='strip' || phase==='assemble') state.phase=phase;
    },
    test() {
      const missing=firstMissing([...parts.keys()]);
      if (missing) return failure('Заверши сборку: '+parts.get(missing).name+'.',missing);
      if (state.locked) return failure('Освободи фиксатор стенда перед проверкой.');
      if (!state.parts[spec.fault].replaced) return failure('Симптом сохранился. Найди дефект измерением и замени неисправную деталь.');
      state.verified=true;
      return ok(spec.result);
    },
  };
}
