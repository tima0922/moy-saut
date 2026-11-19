import { createWorkbench } from './workshop-state.js';

export const ORDER_KEY = 'garage-life-workshop-order-1';
export const SERVICE_ORDERS = {
  engine:{title:'Перегрев двигателя',detail:'Уходит антифриз, после прогрева мотор начинает троить.',units:['engine']},
  gearbox:{title:'Хруст второй передачи',detail:'Вторая включается с хрустом, особенно при быстром переключении.',units:['gearbox']},
  powertrain:{title:'Двигатель и коробка',detail:'Мотор перегревается, а коробка хрустит при включении второй.',units:['engine','gearbox']},
};

export const SERVICE_PHASES = {
  intake:'Приёмка',remove:'Снятие',repair:'Стенд',install:'Установка',check:'Контроль',
};

const step = (id,phase,zone,label,hint,extra={}) => ({id,phase,zone,label,hint,...extra});
const intake = [
  step('diagnose','intake','desk','Считать данные диагностики','Открой карту диагностики у пульта.'),
  step('hood-open','remove','engine','Открыть капот','Освободи доступ к моторному отсеку.'),
  step('power-off','remove','engine','Отключить аккумулятор','Обесточь машину перед снятием агрегатов.'),
];
const enginePrepare = [
  step('engine-drain','remove','engine','Слить масло и антифриз','Подготовь две ёмкости для жидкостей.'),
  step('engine-lines-out','remove','engine','Отсоединить магистрали и проводку','Освободи патрубки, жгут, подачу топлива и выпуск.'),
];
const liftUp = (id,phase) => step(id,phase,'lift','Поднять машину','Подними кузов и зафиксируй подъёмник для доступа снизу.',{lift:true});
const liftDown = (id,phase) => step(id,phase,'lift','Опустить машину','Убери оборудование из-под кузова и опусти подъёмник.',{lift:false});
const separateEngine = [
  liftUp('lift-for-engine','remove'),
  step('engine-separate','remove','under','Разъединить двигатель и коробку','Открути крепёж колокола. Коробка остаётся на своих опорах.',{count:4}),
  liftDown('lift-before-crane','remove'),
];
const engineOut = [
  step('crane-catch','remove','engine','Подвести кран и натянуть цепь','Подхвати вес двигателя до ослабления опор.'),
  step('engine-mounts-out','remove','engine','Открутить опоры','Сними четыре болта опор двигателя.',{count:4}),
  step('engine-raise','remove','engine','Поднять двигатель краном','Подними двигатель выше кромки моторного отсека.'),
  step('engine-dock','remove','stand','Закрепить двигатель на стенде','Перевези двигатель к стенду и освободи стропы.'),
  step('engine-bench','repair','stand','Открыть стенд двигателя','Найди дефект, собери двигатель и проверь его перед возвратом.',{bench:'engine'}),
];
const engineIn = [
  step('engine-pickup','install','stand','Забрать двигатель краном','Зацепи исправный двигатель и освободи крепление стенда.'),
  step('engine-seat','install','engine','Опустить двигатель на опоры','Перенеси двигатель в бокс и совмести опоры.'),
  step('engine-mounts-in','install','engine','Закрепить опоры','Затяни крепёж двигателя перед разгрузкой крана.',{count:4}),
  step('crane-away','install','engine','Снять стропы и отвести кран','Двигатель закреплён. Убери кран из рабочей зоны.'),
];
const joinEngine = [
  liftUp('lift-for-coupling','install'),
  step('engine-join','install','under','Соединить двигатель с коробкой','Установи снятый крепёж колокола.',{count:4}),
  liftDown('lift-after-coupling','install'),
];
const engineFinish = [
  step('engine-lines-in','install','engine','Подключить магистрали и проводку','Верни патрубки, жгут, топливную линию и выпуск.'),
  step('engine-fill','install','engine','Заполнить контуры','Залей масло и антифриз перед контрольным запуском.'),
];
const gearboxOut = [
  liftUp('lift-for-gearbox','remove'),
  step('gearbox-drain','remove','under','Слить масло из коробки','Подготовь коробку к снятию.'),
  step('gearbox-links-out','remove','under','Отсоединить кардан и привод выбора','Освободи коробку от кардана, привода переключения и разъёма.'),
  step('jack-catch','remove','under','Подпереть коробку стойкой','Подними площадку трансмиссионной стойки к картеру.'),
  step('gearbox-mounts-out','remove','under','Открутить опору и колокол','Стойка приняла вес коробки. Освободи крепёж.',{count:4}),
  step('gearbox-lower','remove','under','Снять коробку на стойку','Выведи первичный вал из сцепления и плавно опусти коробку.'),
  step('gearbox-dock','remove','stand','Поставить коробку на верстак','Перемести снятую коробку на стол с ложементом.'),
  step('gearbox-bench','repair','stand','Открыть стенд коробки','Измерь износ, замени деталь и проверь собранную коробку.',{bench:'gearbox'}),
];
const gearboxIn = [
  step('gearbox-pickup','install','stand','Забрать коробку со стенда','Верни коробку на трансмиссионную стойку.'),
  step('gearbox-seat','install','under','Поднять и состыковать коробку','Совмести первичный вал со сцеплением и подведи колокол.'),
  step('gearbox-mounts-in','install','under','Закрепить колокол и опору','Затяни крепёж перед тем, как убрать стойку.',{count:4}),
  step('jack-away','install','under','Опустить и убрать стойку','Коробка держится на опоре и крепеже колокола.'),
  step('gearbox-links-in','install','under','Подключить кардан и привод выбора','Верни кардан, привод переключения и разъём.'),
  step('gearbox-fill','install','under','Заполнить коробку маслом','Подготовь коробку к контрольному переключению.'),
  liftDown('lift-after-gearbox','install'),
];
const checks = [
  step('power-on','install','engine','Подключить аккумулятор','Питание можно вернуть после установки агрегатов и заправки жидкостей.'),
  step('hood-close','install','engine','Закрыть капот','Подготовь машину к проверке в боксе.'),
  step('start-test','check','desk','Провести контрольный запуск','Проверь давление масла и работу двигателя на холостом ходу.'),
];
const shiftTest = step('shift-test','check','desk','Проверить переключение 1 → 2','Проверь включение второй передачи после ремонта коробки.');
const release = step('release','check','desk','Закрыть заказ','Отметь проверки в заказе и передай машину владельцу.');

const routes = {
  engine:[...intake,...enginePrepare,...separateEngine,...engineOut,...engineIn,...joinEngine,...engineFinish,...checks,release],
  gearbox:[...intake,...gearboxOut,...gearboxIn,...checks,shiftTest,release],
  powertrain:[...intake,...enginePrepare,...gearboxOut,liftDown('lift-before-crane','remove'),...engineOut,...engineIn,
    ...engineFinish,liftUp('lift-for-refit','install'),...gearboxIn,...checks,shiftTest,release],
};

export function createServiceOrder(id,snapshot) {
  if (!Object.hasOwn(SERVICE_ORDERS,id)) return null;
  const spec=SERVICE_ORDERS[id], steps=routes[id];
  const index=Number.isInteger(snapshot?.index) ? Math.max(0,Math.min(steps.length,snapshot.index)) : 0;
  const state={id,index,fastener:0,benches:{}};
  const benches=new Map(spec.units.map(unit=>[unit,createWorkbench(unit,snapshot?.benches?.[unit])]));
  for (const [unit,bench] of benches) {
    state.benches[unit]=bench.state;
    const required=steps.findIndex(entry=>entry.bench===unit);
    if (state.index>required && !bench.state.verified) state.index=required;
  }
  const count=steps[state.index]?.count ?? 1;
  if (state.index===index && Number.isInteger(snapshot?.fastener)) state.fastener=Math.min(count-1,Math.max(0,snapshot.fastener));
  const stepIndex=new Map(steps.map((entry,i)=>[entry.id,i]));
  const done = key => (stepIndex.get(key) ?? steps.length)<state.index;

  function advance(key) {
    const next=steps[state.index];
    if (next?.id!==key) return false;
    if (next.bench && !benches.get(next.bench).state.verified) return false;
    if (++state.fastener===(next.count ?? 1)) {
      state.index++;
      state.fastener=0;
    }
    return true;
  }

  function unitLocation(unit) {
    if (unit==='engine') {
      if (done('engine-seat')) return 'installed';
      if (done('engine-pickup')) return 'crane';
      if (done('engine-dock')) return 'stand';
      if (done('engine-raise')) return 'crane';
    } else if (unit==='gearbox') {
      if (done('gearbox-seat')) return 'installed';
      if (done('gearbox-pickup')) return 'jack';
      if (done('gearbox-dock')) return 'stand';
      if (done('gearbox-lower')) return 'jack';
    }
    return 'car';
  }

  function resetBench(unit) {
    if (steps[state.index]?.bench!==unit) return false;
    const bench=createWorkbench(unit);
    benches.set(unit,bench);
    state.benches[unit]=bench.state;
    return true;
  }

  return {spec,steps,state,done,advance,unitLocation,resetBench,bench:unit=>benches.get(unit),
    get current(){return steps[state.index];},get completed(){return state.index===steps.length;}};
}

export function loadServiceOrder(storage) {
  try {
    const saved=JSON.parse(storage?.getItem(ORDER_KEY) ?? 'null');
    return createServiceOrder(saved?.id,saved);
  } catch {
    return null;
  }
}

export function saveServiceOrder(storage,order) {
  try {
    if (order) storage?.setItem(ORDER_KEY,JSON.stringify(order.state));
    else storage?.removeItem(ORDER_KEY);
  } catch {
    // A blocked save must not prevent play in the current tab.
  }
}

export function repairHint(bench) {
  const {spec,state}=bench;
  const fault=state.parts[spec.fault];
  if (state.verified) return {action:'return'};
  if (state.phase==='strip' && !fault.mounted) {
    return {action:!fault.measured ? 'measure' : !fault.replaced ? 'replace' : 'assemble',part:spec.fault};
  }
  if (state.phase==='assemble' && !fault.replaced) return {action:'strip'};
  const incomplete=spec.parts.find(part=>!bench.secure(part));
  if (state.phase==='assemble' && !incomplete) return {action:state.locked ? 'fixture' : 'verify'};

  let part=state.phase==='strip' ? spec.fault : incomplete.id;
  const visited=new Set();
  while (part && !visited.has(part)) {
    visited.add(part);
    const operation=bench.plan(part);
    if (operation.ok) return {action:'part',part};
    if (operation.blocker) {
      part=operation.blocker;
      continue;
    }
    const fixture=bench.fixturePlan();
    if (fixture.ok) return {action:'fixture',part};
    part=fixture.blocker;
  }
  return null;
}
