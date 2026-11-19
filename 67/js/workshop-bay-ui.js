import { ORDER_KEY, SERVICE_ORDERS, SERVICE_PHASES, createServiceOrder, loadServiceOrder, saveServiceOrder } from './workshop-order.js?v=040';
import { STATIONS } from './workshop-spec.js';

const $ = selector=>document.querySelector(selector);
const locationLabels={car:'В машине',crane:'На кране',jack:'На стойке',stand:'На стенде',installed:'Установлен'};

export function createBayUI(storage,{onBench,onOrderChange}) {
  const picker=$('#bay-orders'), action=$('#bay-action'), marker=$('#bay-marker');
  const viewButtons=[...document.querySelectorAll('[data-bay-view]')];
  const messages=$('#bay-result');
  const phaseItems=new Map(Object.entries(SERVICE_PHASES).map(([id,label])=>{
    const node=document.createElement('li');
    node.textContent=label;
    $('#bay-phases').append(node);
    return [id,node];
  }));
  let order=loadServiceOrder(storage), scene, loading, visible=false, busy=false;

  function note(text='') {
    messages.textContent=text;
    messages.hidden=!text;
  }

  function selectView(zone,instant=false) {
    scene?.focus(zone,instant);
    for (const button of viewButtons) button.setAttribute('aria-pressed',String(button.dataset.bayView===zone));
  }

  function render() {
    $('#bay-briefing').hidden=Boolean(order);
    $('#bay-current').hidden=!order;
    if (!order) return;
    const next=order.current;
    $('#work-bay').dataset.step=next?.id ?? 'complete';
    $('#bay-order-state').textContent=order.completed ? 'ЗАКАЗ ЗАКРЫТ' : 'ЗАКАЗ В РАБОТЕ';
    $('#bay-order-title').textContent=order.spec.title;
    $('#bay-order-detail').textContent=order.spec.detail;
    for (const [id,item] of phaseItems) {
      item.dataset.complete=String(order.steps.filter(step=>step.phase===id).every(step=>order.done(step.id)));
      if (next?.phase===id) item.setAttribute('aria-current','step');
      else item.removeAttribute('aria-current');
    }
    $('#bay-step-title').textContent=next?.label ?? 'Машина готова к выдаче';
    $('#bay-step-hint').textContent=next?.hint ?? 'Агрегаты установлены, контрольные проверки пройдены.';
    $('#bay-count').textContent=next?.count ? `${order.state.fastener} / ${next.count}` : '';
    action.textContent=busy ? 'Выполняется…' : next ? next.count
      ? `${next.phase==='remove' ? 'Снять' : 'Затянуть'} крепёж ${order.state.fastener+1}` : next.label : 'Выбрать следующий заказ';
    action.disabled=busy || Boolean(loading && !scene);
    marker.textContent=next?.count ? String(order.state.fastener+1) : 'E';
    if (next) marker.setAttribute('aria-label',action.textContent);
    marker.disabled=action.disabled;
    $('#bay-units').replaceChildren(...order.spec.units.map(unit=>{
      const row=document.createElement('div'), name=document.createElement('dt'), location=document.createElement('dd');
      name.textContent=STATIONS[unit].title;
      const spot=order.unitLocation(unit);
      row.dataset.unit=unit;
      row.dataset.location=spot;
      location.textContent=spot==='stand' && order.bench(unit).state.verified ? 'Собран на стенде' : locationLabels[spot];
      row.append(name,location);
      return row;
    }));
  }

  function save() {
    saveServiceOrder(storage,order);
  }

  function showOutcome(id) {
    const outcomes={
      diagnose:order.state.id==='engine' ? 'Давление в контуре охлаждения растёт. В цилиндре №3 упала компрессия.'
        : order.state.id==='gearbox' ? 'Привод переключения работает. Хруст остаётся только на второй передаче.'
          : 'Цилиндр №3 теряет компрессию. Привод работает, хруст остаётся на второй передаче.',
      'start-test':'Контрольный запуск пройден. Холостой ход ровный, давление масла в норме.',
      'shift-test':'Вторая передача включается плавно. Хруст исчез.',
      release:'Заказ закрыт. Машина готова к выдаче.',
    };
    note(outcomes[id]);
  }

  async function perform() {
    if (action.disabled || !order) return;
    const next=order.current;
    if (!next) {
      order=null;
      save();
      note();
      delete $('#work-bay').dataset.step;
      scene?.update(null);
      selectView('overview');
      render();
      picker.querySelector('button').focus();
      return;
    }
    if (next.bench) {
      onBench(next.bench);
      return;
    }
    if (!order.advance(next.id)) return;
    const running=order;
    save();
    busy=true;
    note();
    render();
    try {
      await scene?.update(order,next);
    } finally {
      busy=false;
      if (order===running) {
        if (order.current?.zone!==next.zone) selectView(order.current?.zone);
        showOutcome(next.id);
      }
      render();
    }
  }

  function enter() {
    visible=true;
    if (scene) {
      scene.visible(true);
      scene.update(order);
      selectView(order?.current?.zone);
    } else if (!loading) {
      loading=import('./workshop-bay.js?v=040').then(({createServiceBay})=>{
        scene=createServiceBay({host:$('#bay-stage'),canvas:$('#bay-canvas'),map:$('#bay-map'),marker,
          mode:$('#bay-render-mode'),onAction:perform});
        scene.visible(visible);
        scene.update(order);
        if (order?.state.index>0) selectView(order.current?.zone,true);
      }).catch(error=>{
        console.error('Workshop bay could not load',error);
        $('#bay-render-mode').textContent='Сцена недоступна. Заказ можно выполнить по карточке.';
      }).finally(()=>{loading=undefined;render();});
    }
    render();
  }

  for (const [id,spec] of Object.entries(SERVICE_ORDERS)) {
    const button=document.createElement('button'), title=document.createElement('strong'), description=document.createElement('span');
    button.type='button';
    button.dataset.order=id;
    title.textContent=spec.title;
    description.textContent=spec.detail;
    button.append(title,description);
    picker.append(button);
    button.onclick=()=>{
      if (order) return;
      order=createServiceOrder(id);
      save();
      scene?.update(order);
      selectView('desk');
      render();
      if (!action.disabled) action.focus({preventScroll:true});
    };
  }
  for (const button of viewButtons) button.onclick=()=>selectView(button.dataset.bayView);
  action.onclick=marker.onclick=perform;
  window.addEventListener('storage',event=>{
    if (event.key!==ORDER_KEY || event.storageArea!==storage) return;
    order=loadServiceOrder(storage);
    note();
    scene?.update(order);
    render();
    onOrderChange();
  });

  return {
    get order(){ return order; },enter,save,
    leave(){visible=false;scene?.visible(false);},
    releaseBench() {
      if (!order?.current?.bench || !order.advance(order.current.id)) return false;
      save();
      note('Сборка проверена. Продолжи работу в боксе.');
      return true;
    },
  };
}
