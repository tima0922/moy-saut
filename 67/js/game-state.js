// Deterministic repair state. No renderer or DOM dependencies.
export const TOOLS = [
  {id:'hands', name:'Руки', short:'Осмотр', key:'1', icon:'hand'},
  {id:'ratchet', name:'Трещотка', short:'Крепёж', key:'2', icon:'wrench'},
  {id:'scanner', name:'OBD-сканер', short:'Диагностика', key:'3', icon:'scan'},
  {id:'fluids', name:'Сервисный набор', short:'Жидкости', key:'4', icon:'drop'},
];

export const PARTS = [
  {id:'battery',name:'Клемма аккумулятора',tool:'ratchet',zone:'bay'},
  {id:'intake_duct',name:'Впускной патрубок',tool:'hands',zone:'bay'},
  {id:'airbox',name:'Воздушный фильтр',tool:'hands',zone:'bay'},
  {id:'wiring',name:'Жгут проводки',tool:'hands',zone:'bay'},
  {id:'fuel_line',name:'Топливная магистраль',tool:'hands',zone:'bay'},
  {id:'upper_hose',name:'Верхний патрубок радиатора',tool:'hands',zone:'bay'},
  {id:'lower_hose',name:'Нижний патрубок радиатора',tool:'hands',zone:'bay'},
  {id:'downpipe',name:'Приёмная труба',tool:'ratchet',zone:'bay',bolts:2},
  {id:'coil_1',name:'Катушка зажигания 1',tool:'hands',zone:'engine'},
  {id:'coil_2',name:'Катушка зажигания 2',tool:'hands',zone:'engine'},
  {id:'coil_3',name:'Катушка зажигания 3',tool:'hands',zone:'engine'},
  {id:'coil_4',name:'Катушка зажигания 4',tool:'hands',zone:'engine'},
  {id:'plug_1',name:'Свеча зажигания 1',tool:'ratchet',zone:'engine'},
  {id:'plug_2',name:'Свеча зажигания 2',tool:'ratchet',zone:'engine'},
  {id:'plug_3',name:'Свеча зажигания 3',tool:'ratchet',zone:'engine'},
  {id:'plug_4',name:'Свеча зажигания 4',tool:'ratchet',zone:'engine'},
  {id:'intake_manifold',name:'Впускной коллектор',tool:'hands',zone:'engine',bolts:2},
  {id:'exhaust_manifold',name:'Выпускной коллектор',tool:'hands',zone:'engine',bolts:2},
  {id:'valve_cover',name:'Клапанная крышка',tool:'hands',zone:'engine',bolts:4},
  {id:'timing_cover',name:'Кожух ГРМ',tool:'hands',zone:'engine',bolts:3},
  {id:'timing_belt',name:'Ремень ГРМ',tool:'hands',zone:'engine'},
  {id:'camshaft_in',name:'Впускной распредвал',tool:'hands',zone:'engine',bolts:2},
  {id:'camshaft_out',name:'Выпускной распредвал',tool:'hands',zone:'engine',bolts:2},
  {id:'cylinder_head',name:'Головка блока цилиндров',tool:'hands',zone:'engine',bolts:6},
  {id:'gasket',name:'Прокладка ГБЦ',tool:'hands',zone:'engine'},
  {id:'oil_filter',name:'Масляный фильтр',tool:'hands',zone:'engine'},
];

export const CHAPTERS = ['Диагностика','Подготовка','Снятие двигателя','Разборка','Сборка','Проверка'];
const byId=Object.fromEntries(PARTS.map(p=>[p.id,p]));
const exterior=['intake_duct','airbox','wiring','fuel_line','upper_hose','lower_hose','downpipe'];
const internal=['oil_filter','coil_1','coil_2','coil_3','coil_4','plug_1','plug_2','plug_3','plug_4','intake_manifold','exhaust_manifold','valve_cover','timing_cover','timing_belt','camshaft_in','camshaft_out','cylinder_head','gasket'];

export function buildSteps(){
  const list=[];
  const add=(id,title,target,tool,chapter,description,duration=800,extra={})=>list.push({id,title,target,tool,chapter,description,duration,...extra});
  const part=(id,install,chapter)=>{
    const p=byId[id], action=install?'Установить':'Снять';
    if(!install && p.bolts) for(let i=0;i<p.bolts;i++) add(`unbolt_${id}_${i}`,`Открутить болт ${i+1}/${p.bolts}`,`${id}_bolt_${i}`,'ratchet',chapter,`${p.name} · удерживай E или кнопку действия`,650,{operation:'unbolt',part:id,bolt:i});
    add(`${install?'install':'remove'}_${id}`,`${action}: ${p.name}`,id,p.tool,chapter,install?'Деталь вернётся на своё место. Затем закрепи её.':'Снятая деталь переместится на рабочий стол.',850,{operation:install?'install':'remove',part:id});
    if(install && p.bolts) for(let i=p.bolts-1;i>=0;i--) add(`bolt_${id}_${i}`,`Затянуть болт ${i+1}/${p.bolts}`,`${id}_bolt_${i}`,'ratchet',chapter,`${p.name} · закрепи деталь перед следующим шагом`,650,{operation:'bolt',part:id,bolt:i});
  };
  add('scan','Подключить OBD-сканер','scanner','scanner',0,'Считай ошибки двигателя. Клиент жалуется на перегрев и неровный холостой ход.',2400);
  add('hood_open','Открыть капот','hood','hands',1,'Капот освободит доступ к моторному отсеку.',600);
  part('battery',false,1);
  add('lift_up','Поднять автомобиль','lift','hands',1,'Подъёмник даст доступ к сливной пробке.',1800);
  add('oil_drain','Слить моторное масло','oil_drain','fluids',1,'Подставь ёмкость. В масле заметны следы охлаждающей жидкости.',1800);
  add('coolant_drain','Слить антифриз','coolant_drain','fluids',1,'Освободи систему охлаждения перед снятием патрубков.',1600);
  add('lift_down','Опустить автомобиль','lift','hands',1,'Для снятия двигателя автомобиль должен стоять в нижнем положении.',1800);
  exterior.forEach(id=>part(id,false,1));
  for(let i=0;i<4;i++) add(`mount_out_${i}`,`Открутить крепление двигателя ${i+1}/4`,`mount_${i}`,'ratchet',2,'Крепление опоры двигателя. Кран подхватит двигатель перед подъёмом.',750,{operation:'mount_out',bolt:i});
  add('crane_move','Подкатить моторный кран','crane','hands',2,'Подведи стрелу крана над моторным отсеком.',1500);
  add('engine_out','Поднять двигатель','engine','hands',2,'Зацепи цепь и плавно подними двигатель из автомобиля.',2200);
  add('engine_stand','Перенести двигатель на стенд','stand','hands',2,'Кран перевезёт двигатель к стенду для разборки.',2200);
  internal.forEach(id=>part(id,false,3));
  add('new_gasket','Взять новую прокладку ГБЦ','new_part','hands',3,'Старая прокладка прогорела между каналами. Новая лежит на верстаке.',800);
  add('fit_gasket','Установить новую прокладку','gasket','hands',4,'Посадочная поверхность подготовлена. Совмести отверстия прокладки.',900,{operation:'install',part:'gasket'});
  [...internal].reverse().filter(id=>id!=='gasket').forEach(id=>part(id,true,4));
  add('engine_return','Снять двигатель со стенда','crane','hands',4,'Кран подхватит собранный двигатель.',1800);
  add('engine_install','Опустить двигатель в автомобиль','engine','hands',4,'Совмести двигатель с опорами и опусти его на место.',2000);
  for(let i=3;i>=0;i--) add(`mount_in_${i}`,`Закрепить опору двигателя ${i+1}/4`,`mount_${i}`,'ratchet',4,'Все опоры должны быть закреплены до первого запуска.',750,{operation:'mount_in',bolt:i});
  [...exterior].reverse().forEach(id=>part(id,true,4));
  add('refill','Залить масло и антифриз','refill','fluids',4,'Залей свежие жидкости и проверь герметичность.',1800);
  part('battery',true,4);
  add('hood_close','Закрыть капот','hood','hands',5,'Теперь можно выполнить контрольный запуск.',650);
  add('test','Проверить двигатель','scanner','scanner',5,'Контрольный запуск: холостой ход, температура и повторное чтение ошибок.',3200);
  add('deliver','Передать автомобиль клиенту','exit','hands',5,'Ремонт завершён. Автомобиль сам выедет из бокса.',1800);
  return list;
}
export const STEPS=buildSteps();

// Data-driven jobs reuse the same physically modeled KOVA S4 components.
// The original 122-step overhaul remains the canonical guided tutorial.
const task=(id,title,target,tool,chapter,description,operation,part=null,duration=850,deps=[])=>({
  id,title,target,tool,chapter,description,operation,part,duration,deps
});
const scan=()=>task('scan','Считать ошибки и параметры','scanner','scanner',0,'Сканер покажет симптомы, но причину нужно подтвердить.');
const hood=()=>task('hood_open','Открыть капот','hood','hands',1,'Получи доступ к двигательному отсеку.');
const close=deps=>task('hood_close','Закрыть капот','hood','hands',5,'Проверь, что всё собрано и закреплено.',null,null,650,deps);
const verify=deps=>task('test','Контрольная диагностика','scanner','scanner',5,'Проверь результат ремонта и считай ошибки.',null,null,1800,deps);
const deliver=()=>task('deliver','Передать автомобиль клиенту','exit','hands',5,'Заказ закрывается после успешной проверки.',null,null,1600,['test']);
const remove=(part,title,deps)=>task(`remove_${part}`,`Снять: ${title}`,part,byId[part].tool,3,'Сними деталь и положи её на верстак.','remove',part,850,deps);
const install=(part,title,deps)=>task(`install_${part}`,`Установить: ${title}`,part,byId[part].tool,4,'Совмести деталь с посадочным местом.','install',part,850,deps);
const replacement=(part,deps)=>task('new_gasket','Забрать новую запчасть','new_part','hands',3,`Подготовь новую деталь: ${byId[part].name}.`,'replace',part,750,deps);
const fluids=(id,title,deps)=>task(id,title,id==='refill'?'refill':id,'fluids',id==='refill'?4:1,'Проверь уровень и безопасность системы.',null,null,1450,deps);
function sequential(steps){return steps.map((s,i)=>({...s,deps:i?[steps[i-1].id]:[]}));}
const ignition=sequential([scan(),hood(),remove('coil_2','Катушка зажигания цилиндра 2'),replacement('coil_2'),install('coil_2','Катушка зажигания цилиндра 2'),close(),verify(),deliver()]);
const intake=sequential([scan(),hood(),remove('intake_duct','Впускной патрубок'),remove('airbox','Воздушный фильтр'),replacement('airbox'),install('airbox','Воздушный фильтр'),install('intake_duct','Впускной патрубок'),close(),verify(),deliver()]);
const coolant=[scan(),hood(),fluids('coolant_drain','Слить охлаждающую жидкость',['hood_open']),
  remove('upper_hose','Верхний патрубок радиатора',['coolant_drain']),
  remove('lower_hose','Нижний патрубок радиатора',['coolant_drain']),
  replacement('upper_hose',['remove_upper_hose']),
  install('upper_hose','Новый верхний патрубок радиатора',['new_gasket']),
  install('lower_hose','Нижний патрубок радиатора',['remove_lower_hose']),
  fluids('refill','Заправить систему охлаждения',['install_upper_hose','install_lower_hose']),
  close(['refill']),verify(['hood_close']),deliver()];
coolant[1].deps=['scan'];
const oil=sequential([scan(),hood(),fluids('oil_drain','Слить масло'),remove('oil_filter','Масляный фильтр'),replacement('oil_filter'),install('oil_filter','Новый масляный фильтр'),fluids('refill','Залить свежее масло'),close(),verify(),deliver()]);

export const JOBS=Object.freeze({
  gasket:{id:'gasket',title:'Капитальный ремонт ГБЦ',fault:'Повреждение прокладки ГБЦ',symptoms:'Перегрев, нестабильный холостой ход и антифриз в масле.',replacementPart:'gasket',steps:STEPS},
  ignition:{id:'ignition',title:'Пропуски зажигания',fault:'Неисправная катушка цилиндра № 2',symptoms:'Двигатель троит, появляется P0302, плохой разгон.',replacementPart:'coil_2',steps:ignition},
  intake:{id:'intake',title:'Потеря тяги',fault:'Забитый воздушный фильтр',symptoms:'Машина плохо разгоняется и расходует больше топлива.',replacementPart:'airbox',steps:intake},
  coolant:{id:'coolant',title:'Утечка антифриза',fault:'Повреждён верхний патрубок радиатора',symptoms:'Падает уровень антифриза, двигатель перегревается.',replacementPart:'upper_hose',steps:coolant},
  oil:{id:'oil',title:'Масляный сервис',fault:'Загрязнён масляный фильтр',symptoms:'Пора заменить масло и масляный фильтр.',replacementPart:'oil_filter',steps:oil},
});
export const MODES={guided:'Обучение',diagnostic:'Диагностика',free:'Свободный ремонт',career:'Карьера',challenge:'На время'};
const JOB_PAYOUTS={gasket:[1700,440],ignition:[520,180],intake:[440,130],coolant:[670,230],oil:[460,160]};
const defaultProfile=()=>({balance:0,reputation:50,orders:[],bestTimes:{}});
const MAX_HISTORY=300;
/** Gameplay state is the only authority. Animated meshes must never be serialized. */
export class RepairSession {
  constructor(jobId='gasket',mode='guided'){this.reset(jobId,mode);}
  reset(jobId='gasket',mode='guided'){
    if(!JOBS[jobId]||!MODES[mode])throw new Error('Неизвестный заказ или режим');
    if(mode==='guided'&&jobId!=='gasket')throw new Error('Обучение доступно для прокладки ГБЦ');
    this.jobId=jobId;this.mode=mode;this.steps=JOBS[jobId].steps;this.index=0;
    this.started=false;this.arrived=false;this.completed=false;this.tool='hands';
    this.removed=new Set();this.looseBolts=new Set();this.replacedParts=new Set();
    this.replaced=false;this.diagnosed=false;this.tested=false;this.lift=0;
    this.engineLocation='car';this.hoodOpen=false;this.oilDrained=false;this.coolantDrained=false;
    this.refilled=false;this.delivered=false;this.actions=0;this.startedAt=0;
    this.done=new Set();this.history=[];this.selectedStepId=null;
    this.hypothesis=null;this.wrongHypotheses=0;
    this.profile=defaultProfile();this.rewarded=false;
  }
  get availableSteps(){
    if(this.mode!=='free')return this.step?[this.step]:[];
    return this.steps.filter(s=>!this.done.has(s.id)&&(s.deps||[]).every(d=>this.done.has(d)));
  }
  get step(){
    if(this.mode!=='free')return this.steps[this.index]||null;
    return this.availableCandidate();
  }
  availableCandidate(){
    const ready=this.steps.filter(s=>!this.done.has(s.id)&&(s.deps||[]).every(d=>this.done.has(d)));
    return ready.find(s=>s.id===this.selectedStepId)||ready[0]||null;
  }
  chooseStep(id){
    if(this.mode!=='free')return false;
    if(!this.availableSteps.some(s=>s.id===id))return false;
    this.selectedStepId=id;return true;
  }
  get progress(){return this.index/this.steps.length;}
  recordCompletion(elapsed){
    if(!this.completed||this.rewarded||!Number.isFinite(elapsed)||elapsed<0)return null;
    if(this.mode!=='career'&&this.mode!=='challenge')return null;
    if(this.mode==='challenge'){
      const prev=this.profile.bestTimes[this.jobId];
      this.profile.bestTimes[this.jobId]=Math.min(prev??Infinity,elapsed);
      this.rewarded=true;return {time:elapsed,best:this.profile.bestTimes[this.jobId]};
    }
    const [payout,cost]=JOB_PAYOUTS[this.jobId];
    const bonus=Math.max(0,100-this.wrongHypotheses*20);
    const earned=Math.max(0,payout-cost+bonus);
    this.profile.balance+=earned;
    this.profile.reputation=Math.min(100,Math.max(0,this.profile.reputation+(this.wrongHypotheses?0:2)));
    this.profile.orders.push({jobId:this.jobId,earned,elapsed,date:Date.now()});
    this.profile.orders=this.profile.orders.slice(-100);
    this.rewarded=true;return {earned,balance:this.profile.balance,reputation:this.profile.reputation};
  }
  nextCareerJob(){
    if(this.mode!=='career'||!this.completed||!this.rewarded)return false;
    const rotation=['ignition','intake','coolant','oil','gasket'];
    const next=rotation[(rotation.indexOf(this.jobId)+1)%rotation.length];
    const profile=this.profile;
    this.reset(next,'career');this.profile=profile;
    return next;
  }
  selectTool(id){if(!TOOLS.some(t=>t.id===id))return false;this.tool=id;return true;}
  begin(){if(this.started)return false;this.started=true;this.startedAt=Date.now();return true;}
  setHypothesis(id){
    if(this.mode==='guided'||!JOBS[id]||!this.diagnosed)return false;
    this.hypothesis=id;
    if(id!==this.jobId)this.wrongHypotheses++;
    return id===this.jobId;
  }
  check(target){
    if(!this.started||!this.arrived)return {ok:false,reason:'Дождись, пока автомобиль встанет в бокс.'};
    if(this.completed||!this.step)return {ok:false,reason:'Заказ уже завершён.'};
    if(target!==this.step.target)return {ok:false,reason:`Сначала: ${this.step.title.toLowerCase()}.`};
    if(this.tool!==this.step.tool)return {ok:false,reason:`Нужен инструмент: ${TOOLS.find(t=>t.id===this.step.tool).name}.`};
    if(this.step.id==='test'&&this.mode==='diagnostic'&&this.hypothesis!==this.jobId)
      return {ok:false,reason:'Подтверди правильную причину неисправности в журнале диагностики.'};
    return {ok:true};
  }
  perform(target){
    const valid=this.check(target);if(!valid.ok)return valid;
    const s=this.step;
    if(s.operation==='remove')this.removed.add(s.part);
    if(s.operation==='install')this.removed.delete(s.part);
    if(s.operation==='unbolt'||s.operation==='mount_out')this.looseBolts.add(s.target);
    if(s.operation==='bolt'||s.operation==='mount_in')this.looseBolts.delete(s.target);
    if(s.id==='scan')this.diagnosed=true;
    if(s.id==='lift_up')this.lift=1.2;
    if(s.id==='lift_down')this.lift=0;
    if(s.id==='hood_open')this.hoodOpen=true;
    if(s.id==='hood_close')this.hoodOpen=false;
    if(s.id==='oil_drain')this.oilDrained=true;
    if(s.id==='coolant_drain')this.coolantDrained=true;
    if(s.id==='refill')this.refilled=true;
    if(s.id==='engine_out'||s.id==='engine_return')this.engineLocation='crane';
    if(s.id==='engine_stand')this.engineLocation='stand';
    if(s.id==='engine_install')this.engineLocation='car';
    if(s.id==='new_gasket'){
      this.replaced=true;
      this.replacedParts.add(JOBS[this.jobId].replacementPart);
    }
    if(s.id==='test')this.tested=true;
    if(s.id==='deliver')this.delivered=true;
    this.done.add(s.id);this.history.push({id:s.id,at:Date.now()});
    if(this.history.length>MAX_HISTORY)this.history.shift();
    this.index++;this.actions++;this.selectedStepId=null;
    if(this.index===this.steps.length)this.completed=true;
    return {ok:true,step:s,next:this.step,complete:this.completed};
  }
  snapshot(){return {
    schemaVersion:2,jobId:this.jobId,mode:this.mode,completedSteps:[...this.done],
    actionOrder:this.history.map(h=>h.id),history:this.history.map(h=>({...h})),
    started:this.started,arrived:this.arrived,tool:this.tool,startedAt:this.startedAt,
    hypothesis:this.hypothesis,wrongHypotheses:this.wrongHypotheses,
    selectedStepId:this.selectedStepId,profile:this.profile,rewarded:this.rewarded
  };}
  /** Replay *validated* commands into the model; rejects corrupt/impossible saves. */
  restore(data){
    if(!data||data.schemaVersion!==2||!JOBS[data.jobId]||!MODES[data.mode])throw new Error('Неизвестная версия сохранения');
    if(data.mode==='guided'&&data.jobId!=='gasket')throw new Error('Некорректный режим обучения');
    if(!Array.isArray(data.actionOrder)||data.actionOrder.length>JOBS[data.jobId].steps.length)
      throw new Error('Недопустимая история ремонта');
    const copy=new RepairSession(data.jobId,data.mode);
    if(data.started){copy.begin();copy.arrived=true;}
    for(const id of data.actionOrder){
      if(copy.mode==='free'&&!copy.chooseStep(id))throw new Error(`Нарушены зависимости: ${id}`);
      const step=copy.step;
      if(!step||step.id!==id)throw new Error(`Недопустимый шаг: ${id}`);
      if(step.id==='test'&&copy.mode==='diagnostic')copy.hypothesis=copy.jobId;
      copy.selectTool(step.tool);
      if(!copy.perform(step.target).ok)throw new Error(`Не удалось восстановить: ${id}`);
    }
    if(Array.isArray(data.completedSteps)&&
       (data.completedSteps.length!==copy.done.size||data.completedSteps.some(id=>!copy.done.has(id))))
      throw new Error('Повреждённый список действий');
    if(data.mode==='diagnostic'){
      if(data.hypothesis!==null&&data.hypothesis!==undefined&&!JOBS[data.hypothesis])throw new Error('Неизвестный диагноз');
      if(copy.tested&&data.hypothesis!==copy.jobId)throw new Error('Диагноз не подтверждён');
      copy.hypothesis=data.hypothesis??null;
      copy.wrongHypotheses=Number.isInteger(data.wrongHypotheses)&&data.wrongHypotheses>=0?Math.min(data.wrongHypotheses,1000):0;
    }
    if(data.tool&&!copy.selectTool(data.tool))throw new Error('Неизвестный инструмент');
    if(!data.started&&data.actionOrder.length)throw new Error('Действия до начала игры');
    copy.arrived=Boolean(data.arrived||copy.index>0);copy.startedAt=Number.isFinite(data.startedAt)&&data.startedAt>0?data.startedAt:copy.startedAt;
    if(data.selectedStepId)copy.chooseStep(data.selectedStepId);
    if(Array.isArray(data.history)&&data.history.length===copy.history.length&&
      data.history.every((h,i)=>h.id===copy.history[i].id&&Number.isFinite(h.at)))
      copy.history=data.history.map(h=>({id:h.id,at:h.at}));
    if(data.profile){
      const p=data.profile;
      if(!Number.isSafeInteger(p.balance)||p.balance<0||p.balance>1e9||
         !Number.isInteger(p.reputation)||p.reputation<0||p.reputation>100||
         !Array.isArray(p.orders)||p.orders.length>100||!p.bestTimes||typeof p.bestTimes!=='object')
         throw new Error('Повреждённый профиль');
      for(const order of p.orders)if(!JOBS[order.jobId]||!Number.isSafeInteger(order.earned)||order.earned<0||
        !Number.isFinite(order.elapsed)||order.elapsed<0||!Number.isFinite(order.date))throw new Error('Повреждённая история заказов');
      for(const [id,v] of Object.entries(p.bestTimes))if(!JOBS[id]||!Number.isFinite(v)||v<0)throw new Error('Повреждённые рекорды');
      copy.profile=JSON.parse(JSON.stringify(p));
    }
    if(data.rewarded&&(!copy.completed||(copy.mode!=='career'&&copy.mode!=='challenge')))throw new Error('Некорректная награда');
    copy.rewarded=Boolean(data.rewarded);
    Object.assign(this,copy);return this;
  }
}
