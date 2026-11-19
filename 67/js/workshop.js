import { STATIONS,WORKSHOP_TOOLS } from './workshop-spec.js';
import { createWorkbench, loadBench, saveBench, torqueStages } from './workshop-state.js';
import { createBayUI } from './workshop-bay-ui.js?v=041';
import { repairHint } from './workshop-order.js?v=040';

const $ = selector=>document.querySelector(selector);
const stationButtons=[...document.querySelectorAll('[data-station]')];
const phaseButtons=[...document.querySelectorAll('[data-phase]')];
const filterButtons=[...document.querySelectorAll('[data-filter]')];
const pageButtons=[...document.querySelectorAll('[data-view]')];
const stage=$('#model-stage'), loading=$('#model-loading');
const list=$('#inventory-list'), search=$('#part-search');
const dial=$('#torque-value'), serviceStatus=$('#service-result');
const reset=$('#reset-workbench');
const appUrl=new URL(location.href);
const toolLabels={hands:'Руки',ratchet:'Трещотка',torque:'Ключ Н·м',gauge:'Измеритель',fixture:'Фиксатор'};
const partRows=new Map(), partSections=new Map(), toolButtons=new Map();
let storage;
try { storage=localStorage; } catch { /* The current workbench still works in memory. */ }
const sessions=new Map();
let current, selected, tool, filter='all', view, explode=false, isolate=false;
let practiceStation='engine';
let scene, sceneStation, sceneLoading;
const bay=createBayUI(storage,{
  onBench:()=>setView('repair'),
  onOrderChange:()=>{
    if (view==='repair') setView(bay.order?.current?.bench ? 'repair' : 'bay');
  },
});
const atBench=()=>view==='benches' || view==='repair';

function selectGroup(buttons, key, value) {
  for (const button of buttons) button.setAttribute('aria-pressed',String(button.dataset[key]===value));
}
function session(id) {
  if (view==='repair') return bay.order.bench(id);
  if (!sessions.has(id)) sessions.set(id,createWorkbench(id,loadBench(storage,id)));
  return sessions.get(id);
}
function persist() {
  if (view==='repair') bay.save();
  else saveBench(storage,current.spec.id,current.state);
}
function setAddress() {
  if (view!=='bay') appUrl.searchParams.set('view',view);
  else appUrl.searchParams.delete('view');
  if (view==='benches' && current?.spec.id!=='engine') appUrl.searchParams.set('station',current.spec.id);
  else appUrl.searchParams.delete('station');
  history.replaceState(null,'',appUrl);
}
function status(result) {
  serviceStatus.textContent=result?.message ?? '';
  serviceStatus.dataset.result=result?.ok ? 'success' : 'error';
  serviceStatus.hidden=!result;
}
function recommended() {
  const step=current.plan(selected);
  return step.ok ? step.tool : current.state.phase==='strip' && !current.state.parts[selected].mounted ? 'gauge' : 'hands';
}

for (const [id,label] of Object.entries(WORKSHOP_TOOLS)) {
  const button=document.createElement('button');
  button.type='button';
  button.dataset.tool=id;
  button.setAttribute('aria-label',label);
  button.title=label;
  button.textContent=toolLabels[id];
  button.addEventListener('click',()=>{
    tool=id;
    status(null);
    render();
  });
  toolButtons.set(id,button);
  $('#tools-list').append(button);
}
function makeInventory() {
  list.scrollTop=0;
  list.replaceChildren();
  partRows.clear();partSections.clear();
  for (const part of current.spec.parts) {
    if (!partSections.has(part.group)) {
      const wrapper=document.createElement('section');
      const title=document.createElement('h3'), rows=document.createElement('div');
      title.textContent=part.group;rows.className='part-rows';
      wrapper.className='part-section';
      wrapper.append(title,rows);
      list.append(wrapper);
      partSections.set(part.group,{wrapper,rows});
    }
    const button=document.createElement('button');
    button.type='button';
    button.textContent=part.name;
    button.addEventListener('click',()=>{
      selectPart(part.id);
      if (matchMedia('(max-width: 535px)').matches) $('.service').scrollIntoView({block:'start'});
    });
    partSections.get(part.group).rows.append(button);
    partRows.set(part.id,button);
  }
}
function drawInventory() {
  const query=search.value.trim().toLocaleLowerCase('ru');
  let matched=0, removed=0;
  for (const [id,button] of partRows) {
    const part=current.parts.get(id);
    const node=current.state.parts[id], ready=current.plan(id).ok;
    removed+=Number(!node.mounted);
    button.hidden=(filter==='removed' && node.mounted || filter==='available' && !ready) ||
      Boolean(query && !part.name.toLocaleLowerCase('ru').includes(query));
    button.dataset.status=node.mounted ? ready ? 'ready' : 'mounted' : 'removed';
    button.setAttribute('aria-pressed',String(id===selected));
    if (!button.hidden) matched++;
  }
  for (const {wrapper,rows} of partSections.values()) wrapper.hidden=Array.from(rows.children).every(row=>row.hidden);
  $('#inventory-empty').hidden=Boolean(matched);
  $('#tray-count').textContent=removed;
}

function actionPlan() {
  if (tool==='fixture') {
    const fixture=current.fixturePlan();
    return {...fixture,label:current.state.locked ? current.spec.fixture.release : current.spec.fixture.engage};
  }
  if (tool==='gauge') {
    const mounted=current.state.parts[selected].mounted;
    return {ok:!mounted,action:'inspect',tool:'gauge',label:'Измерить деталь',
      message:mounted ? 'Сними деталь, чтобы проверить её на стенде.' : 'Измерение покажет состояние детали.'};
  }
  return current.plan(selected);
}

function drawFasteners(part,node,next) {
  $('#fastener-status').hidden=!part.bolts;
  if (!part.bolts) return;
  const stages=torqueStages(part), left=Math.min(part.bolts,node.fastened);
  const tightening=next.ok && next.action==='tighten';
  const progress=tightening ? node.fastened%part.bolts : left;
  $('#fastener-count').textContent=progress+' / '+part.bolts+(tightening && stages.length>1 ? ' · проход '+next.stage+'/'+stages.length : '');
  const order=part.order ?? Array.from({length:part.bolts},(_,i)=>i);
  const grid=$('#fastener-grid');
  grid.replaceChildren(...order.map((_,index)=>{
    const tag=document.createElement('span');
    tag.textContent=String(index+1);
    const active=next.ok && next.index===index;
    const fixed=order.indexOf(index)<progress;
    tag.dataset.status=active ? 'active' : fixed ? 'fixed' : 'loose';
    tag.setAttribute('aria-label',`Болт ${index+1}: ${active ? 'следующий' : fixed ? 'затянут' : 'свободен'}`);
    return tag;
  }));
}

function drawService() {
  const part=current.parts.get(selected), node=current.state.parts[selected], next=current.plan(selected), operation=actionPlan();
  $('#part-group').textContent=part.group;
  $('#service-title').textContent=part.name;
  $('#part-description').textContent=part.info;
  const stateBadge=$('#part-state');
  stateBadge.dataset.state=node.mounted ? 'mounted' : 'removed';
  stateBadge.textContent=!node.mounted ? 'На лотке' : current.secure(part) ? 'Закреплена' : 'Ослаблена';
  drawFasteners(part,node,next);
  const highlighted=operation.ok ? operation.tool : next.tool;
  for (const [id,button] of toolButtons) {
    button.setAttribute('aria-pressed',String(id===tool));
    button.dataset.useful=String(id===highlighted || id==='fixture' && !next.ok && /фиксатор/.test(next.message));
    if(id==='fixture') button.textContent=current.state.locked ? 'Фиксатор ✓' : 'Фиксатор';
  }
  const tightening=operation.ok && operation.action==='tighten' && tool==='torque';
  $('#torque-box').hidden=!tightening;
  if (tightening) {
    $('#torque-target').textContent='Стенд KOVA · '+operation.moment+' Н·м'+(operation.stages>1
      ? ' · проход '+operation.stage+'/'+operation.stages : '');
    $('#torque-reading').textContent=dial.value+' Н·м';
  }
  $('#torque-set').hidden=view!=='repair' || !tightening;
  const action=$('#operate-part'), blocker=$('#operate-blocker');
  action.textContent=operation.label ?? (current.state.phase==='strip' ? 'Снять деталь' : 'Установить деталь');
  action.disabled=!operation.ok || operation.tool!==tool;
  blocker.hidden=!operation.blocker;
  const toolHint=operation.ok && operation.tool!==tool ? 'Нужен инструмент: '+WORKSHOP_TOOLS[operation.tool]+'.' : '';
  $('#tool-status').textContent=toolHint || operation.message || (
    operation.action==='fixture' ? current.spec.fixture.name : operation.index===undefined ? 'Можно выполнить действие.' : 'Следующий крепёж выделен на модели.');
  const inspected=current.inspection(selected), inspection=$('#part-inspection');
  inspection.hidden=!inspected;
  inspection.textContent=inspected ?? '';
  inspection.dataset.fault=String(selected===current.spec.fault && !node.replaced);
  $('#replace-part').hidden=!(inspected && selected===current.spec.fault && !node.mounted && !node.replaced);
  const hint=view==='repair' ? repairHint(current) : null;
  const guide=$('#next-part');
  guide.textContent=view==='repair' ? ({part:'К нужной детали',fixture:'К фиксатору',measure:'К измерению',replace:'К замене',
    assemble:'К сборке',strip:'К разборке',verify:'К проверке',return:'К установке'})[hint?.action] ?? 'Подсказка' : 'Следующая';
  guide.disabled=view==='repair' ? !hint || (hint.action==='part' && hint.part===selected && tool===next.tool)
    : !current.spec.parts.some(candidate=>candidate.id!==selected && current.plan(candidate.id).ok);
  $('#job-stamp').hidden=!current.state.verified;
  if (view==='repair') {
    $('#transfer-status').textContent=current.state.verified ? 'Сборка проверена. Теперь агрегат можно вернуть к машине.'
      : 'Агрегат закреплён на стенде. После сборки выполни проверку.';
    $('#transfer-release').hidden=!current.state.verified;
  }
}
function render() {
  selectGroup(phaseButtons,'phase',current.state.phase);
  selectGroup(filterButtons,'filter',filter);
  $('#view-explode').setAttribute('aria-pressed',String(explode));
  $('#view-isolate').setAttribute('aria-pressed',String(isolate));
  drawInventory();
  drawService();
  const all=current.spec.parts, count=all.filter(current.secure).length;
  $('#assembly-count').textContent=count+' / '+all.length+' закреплено';
  for (const button of view==='benches' ? stationButtons : []) {
    const active=session(button.dataset.station);
    button.querySelector('[data-summary]').textContent=active.state.verified ? 'ПРОВЕРЕНО' : active.spec.parts.length+' ДЕТ.';
  }
  syncScene();
}
function selectPart(id) {
  if (!current.parts.has(id)) return;
  selected=id;
  isolate=!explode && !current.state.parts[id].mounted;
  tool=recommended();
  status(null);
  render();
}
function syncScene() {
  if (!scene || !current || !atBench()) return;
  if (sceneStation!==current.spec.id) {
    scene.use(current.spec);
    sceneStation=current.spec.id;
  }
  scene.update(current.state,selected,current.plan(selected),{explode,isolate});
}
function openStation(id) {
  if (view==='benches') practiceStation=id;
  current=session(id);
  selectGroup(stationButtons,'station',id);
  const hint=view==='repair' ? repairHint(current) : null;
  selected=hint?.part ?? current.spec.parts.find(part=>current.plan(part.id).ok)?.id ?? current.spec.parts[0].id;
  tool=recommended();
  filter='all';
  explode=isolate=false;
  search.value='';
  $('#model-title').textContent=current.spec.title;
  $('#model-spec').textContent=current.spec.detail;
  $('#job-symptoms').textContent=current.spec.symptoms;
  $('#job-hint').textContent=current.spec.hint;
  $('.bench-job details').open=false;
  status(null);
  makeInventory();
  setAddress();
  render();
}
function ensureScene() {
  if (scene || sceneLoading) return;
  loading.textContent='Готовим модель…';
  sceneLoading=import('./workshop-view.js?v=041').then(({createWorkshopView})=>{
    scene=createWorkshopView({
      host:stage,canvas:$('#workshop-3d'),diagram:$('#workshop-diagram'),marker:$('#bolt-marker'),status:$('#view-kind'),
      onPick:selectPart,
    });
    loading.hidden=true;
    syncScene();
  }).catch(error=>{
    console.error('Workshop view failed',error);
    loading.textContent='Модель не загрузилась. Деталями по-прежнему можно управлять через список.';
    sceneLoading=undefined;
  });
}

function setView(next) {
  if (next==='repair' && !bay.order?.current?.bench) next='bay';
  view=next;
  selectGroup(pageButtons,'view',view==='repair' ? 'bay' : view);
  $('#work-bay').hidden=view!=='bay';
  $('#work-benches').hidden=!atBench();
  $('#bench-picker').hidden=view==='repair';
  $('#bench-transfer').hidden=view!=='repair';
  $('#work-intro-text').textContent={bay:'Прими заказ на KOVA S4 и доведи ремонт до контрольного запуска.',
    benches:'Учебная разборка двигателя, подвески и коробки передач.',repair:'Диагностика, разборка и сборка снятого агрегата.'}[view];
  if (view==='bay') bay.enter();
  else bay.leave();
  if (atBench()) {
    if (view==='repair') $('#transfer-order').textContent=bay.order.spec.title+' · KOVA S4';
    openStation(view==='repair' ? bay.order.current.bench : practiceStation);
    ensureScene();
  }
  setAddress();
  window.scrollTo(0,0);
}
for (const button of pageButtons) button.onclick=()=>setView(button.dataset.view);
for (const button of stationButtons) button.onclick=()=>{ if (view==='benches') openStation(button.dataset.station); };
for (const button of phaseButtons) button.onclick=()=>{
  current.setPhase(button.dataset.phase);
  tool=recommended();
  status(null);
  persist();
  render();
};
for (const button of filterButtons) button.onclick=()=>{
  filter=button.dataset.filter;
  selectGroup(filterButtons,'filter',filter);
  drawInventory();
};
search.oninput=drawInventory;
dial.oninput=()=>{ $('#torque-reading').textContent=dial.value+' Н·м'; };
$('#torque-set').onclick=()=>{
  const step=actionPlan();
  if (step.ok && step.action==='tighten') { dial.value=step.moment; dial.oninput(); }
};
$('#view-explode').onclick=()=>{
  explode=!explode;
  if (explode) isolate=false;
  render();
};
$('#view-isolate').onclick=()=>{ isolate=!isolate;render(); };
$('#view-reset').onclick=()=>scene?.resetCamera();
$('#zoom-out').onclick=()=>scene?.zoom(1.13);
$('#zoom-in').onclick=()=>scene?.zoom(.89);
$('#operate-blocker').onclick=()=>{
  const {blocker}=actionPlan();
  if (blocker) selectPart(blocker);
};
$('#next-part').onclick=()=>{
  if (view==='repair') {
    const hint=repairHint(current);
    if (!hint) return;
    if (hint.part) selectPart(hint.part);
    if (hint.action==='fixture') tool='fixture';
    if (hint.action==='measure') tool='gauge';
    if (hint.action==='replace') $('#replace-part').focus();
    if (hint.action==='verify') $('#verify-job').focus();
    if (hint.action==='return') $('#transfer-release').focus();
    if (hint.action==='assemble' || hint.action==='strip') {
      current.setPhase(hint.action);
      const next=repairHint(current);
      if (next?.part) selectPart(next.part);
      if (next?.action==='fixture') tool='fixture';
      persist();
    }
    render();
    return;
  }
  const next=current.spec.parts.find(candidate=>candidate.id!==selected && current.plan(candidate.id).ok);
  if (next) selectPart(next.id);
};
$('#operate-part').onclick=()=>{
  const step=actionPlan();
  if (!step.ok || step.tool!==tool) return;
  const result=tool==='fixture' ? current.toggleFixture() : tool==='gauge' ? current.inspect(selected)
    : current.operate(selected,tool,Number(dial.value));
  if (result.ok) {
    persist();
    if (tool==='fixture') tool=recommended();
    else if (tool!=='gauge') {
      tool=recommended();
      if (step.action==='remove' && !explode) isolate=true;
      else if (step.action==='install') isolate=false;
    }
  }
  status(result);
  render();
};
$('#replace-part').onclick=()=>{
  const result=current.replace(selected);
  if (result.ok) persist();
  status(result);
  render();
};
$('#verify-job').onclick=()=>{
  const result=current.test();
  if (result.blocker) selectPart(result.blocker);
  if (result.ok) persist();
  status(result);
  render();
};
$('#transfer-back').onclick=()=>setView('bay');
$('#transfer-release').onclick=()=>{ if (bay.releaseBench()) setView('bay'); };
$('#reset-bench').onclick=()=>{ reset.returnValue='';reset.showModal(); };
reset.addEventListener('close',()=>{
  if (reset.returnValue!=='reset' || !atBench()) return;
  const {id}=current.spec;
  if (view==='repair') bay.order.resetBench(id);
  else sessions.set(id,createWorkbench(id));
  openStation(id);
  persist();
  status({ok:true,message:'Стенд готов к началу нового ремонта.'});
});

const selectedStation=appUrl.searchParams.get('station');
const requestedView=appUrl.searchParams.get('view');
if (Object.hasOwn(STATIONS,selectedStation)) practiceStation=selectedStation;
const initialView=['benches','repair'].includes(requestedView) ? requestedView
  : Object.hasOwn(STATIONS,selectedStation) ? 'benches' : 'bay';
setView(initialView);
