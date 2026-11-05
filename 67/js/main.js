import * as THREE from 'three';
import {Group as TweenGroup,Tween,Easing} from '@tweenjs/tween.js';
import {createWorld} from './world.js';
import {RepairSession,TOOLS,PARTS,STEPS,CHAPTERS,JOBS,MODES} from './game-state.js';
import {SaveStore,createSave,SAVE_SLOTS} from './save-store.js';
import {applyCommittedState} from './world-state.js';

const $=s=>document.querySelector(s);
const icons={
  garage:'<path d="m3 10 9-6 9 6v11H3Z"/><path d="M7 21V11h10v10M7 15h10M7 18h10"/>',
  hand:'<path d="M8 13V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-2 7-6 7h-2c-2 0-3-1-4-3l-4-5a2 2 0 0 1 3-2l2 2"/>',
  wrench:'<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l6-6a5 5 0 0 0 6-6l-4 3-3-3 2-3Z"/><path d="m5.5 18.5 0 0"/>',
  scan:'<rect x="5" y="3" width="14" height="18" rx="3"/><rect x="8" y="6" width="8" height="6" rx="1"/><path d="M8 16h2m4 0h2m-8 3h2m4 0h2"/>',
  drop:'<path d="M12 2c3 5 7 9 7 13a7 7 0 0 1-14 0c0-4 4-8 7-13Z"/><path d="M8 14a4 4 0 0 0 4 4"/>',
  engine:'<path d="M7 5h8M11 5v3M4 11V8h13l3 3v8H8l-3-3H3v-5Zm16 2h2v5h-2M1 10v7"/>',
  power:'<path d="M12 2v10M6.5 5.5a9 9 0 1 0 11 0"/>',
  settings:'<path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 3 3 3-1 1-3 3-1 1-4-3-2-1-4-4-1Z"/><circle cx="12" cy="12" r="3"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3m0 3h.01"/>',
  volume:'<path d="m11 4-5 4H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  volumeOff:'<path d="m11 4-5 4H3v8h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v6"/>',
  clipboard:'<path d="M8 4H5v18h14V4h-3"/><rect x="8" y="2" width="8" height="5" rx="1"/><path d="m8 13 2 2 6-6M8 18h8"/>',
  crosshair:'<circle cx="12" cy="12" r="7"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/><circle cx="12" cy="12" r="1"/>',
  chevronUp:'<path d="m6 15 6-6 6 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  move:'<path d="M12 2v20M2 12h20m-14-6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.wrench}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));

const session=new RepairSession();
const saveStore=new SaveStore();
let autosaveErrorShown=false,gpuLost=false,pausedAt=null,pausedMs=0;
const activeClock=()=>performance.now()-pausedMs-(pausedAt===null?0:performance.now()-pausedAt);
const tweens=new TweenGroup();
const canvas=$('#scene');
let renderer,world;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.outputColorSpace=THREE.SRGBColorSpace;
  world=createWorld(renderer);
}catch(error){
  $('#loading-text').textContent='Не удалось запустить WebGL. Открой игру в Chrome или Edge с аппаратным ускорением.';
  $('.loading-track').style.display='none';console.error(error);throw error;
}
const scene=world.scene;
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.05,65);
camera.position.set(-5.4,3.1,-5.8);camera.lookAt(.4,1.0,.1);camera.rotation.order='YXZ';
scene.add(camera);
// Lightweight first-person gloves and tools; no animated character download.
const handRig=new THREE.Group();handRig.position.set(.34,-.28,-.56);handRig.rotation.set(.08,-.18,-.12);camera.add(handRig);handRig.visible=false;
const gloveMat=new THREE.MeshStandardMaterial({color:0x3c494b,roughness:.9});
const sleeveMat=new THREE.MeshStandardMaterial({color:0x253137,roughness:1});
const palm=world.box(handRig,[.082,.085,.13],[.015,-.08,.07],gloveMat);palm.rotation.x=-.24;
const sleeve=world.cylinder(handRig,.052,.063,.25,[.035,-.2,.18],sleeveMat,[.65,0,-.12]);
for(let i=0;i<4;i++){const finger=world.box(handRig,[.018,.061,.048],[-.025+i*.019,-.034,.015],gloveMat);finger.rotation.x=-.5;}
world.box(handRig,[.032,.05,.061],[.058,-.054,.012],gloveMat,[0,.5,-.3]);
const heldTools=new Map();
for(const id of ['ratchet','scanner','fluids']){const g=new THREE.Group();handRig.add(g);heldTools.set(id,g);}
const ratchet=heldTools.get('ratchet');world.cylinder(ratchet,.012,.014,.23,[0,.077,-.025],world.mats.metal,[0,0,-.2]);world.cylinder(ratchet,.021,.018,.09,[.025,-.025,-.025],world.mats.dark,[0,0,-.2]);world.cylinder(ratchet,.035,.035,.026,[-.02,.202,-.025],world.mats.metal,[Math.PI/2,0,0],16);world.cylinder(ratchet,.014,.014,.04,[-.02,.202,-.048],world.mats.steel,[Math.PI/2,0,0],6);
const obd=heldTools.get('scanner');world.box(obd,[.16,.22,.047],[0,.06,-.04],world.mats.orange);world.box(obd,[.133,.12,.01],[0,.089,-.012],world.mats.black);world.textPlane(obd,'OBD II',.102,.026,[0,.117,-.005],[0,0,0],'#b4d399');world.textPlane(obd,'READY',.09,.021,[0,.075,-.005],[0,0,0],'#a8d496');for(const x of [-.045,0,.045])world.box(obd,[.024,.022,.009],[x,-.016,-.01],world.mats.dark);
const fluids=heldTools.get('fluids');world.box(fluids,[.13,.2,.085],[0,.055,-.045],world.mats.blue);world.cylinder(fluids,.025,.025,.048,[.025,.179,-.045],world.mats.dark);world.textPlane(fluids,'SERVICE',.108,.029,[0,.072,.001],[0,0,0],'#e4e9db');
handRig.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
const raycaster=new THREE.Raycaster();
const center=new THREE.Vector2();
const clock=new THREE.Clock();
let busy=false,traveling=false,hold=0,held=false,holdSource=null,modalOpen=false,autoFocus=true;
let quality=matchMedia('(max-width:760px)').matches?'balanced':'high',sensitivity=1,muted=true;
let focused=false,toastTimer=null,frameCount=0,fpsElapsed=0,gameElapsed=0,dragging=false,lastPointer={x:0,y:0};
const keys=new Set(),joy={x:0,y:0};
let modalReturnFocus=null,audioContext=null;
const anim=(obj,to,duration=750,update)=>new Promise(resolve=>{const t=new Tween(obj,tweens).to(to,duration).easing(Easing.Cubic.InOut).onComplete(resolve);if(update)t.onUpdate(update);t.start(activeClock());});
function beep(kind='click'){
  if(muted)return;
  try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.connect(gain);gain.connect(audioContext.destination);const now=audioContext.currentTime;oscillator.type=kind==='ratchet'?'square':'sine';oscillator.frequency.setValueAtTime(kind==='error'?130:kind==='ratchet'?180:kind==='done'?690:430,now);gain.gain.setValueAtTime(.025,now);gain.gain.exponentialRampToValueAtTime(.001,now+.1);oscillator.start(now);oscillator.stop(now+.11);}catch{/* Audio is optional. */}
}
function motorSound(duration=3){
  if(muted)return;
  try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain(),filter=audioContext.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(48,audioContext.currentTime);o.frequency.linearRampToValueAtTime(65,audioContext.currentTime+duration*.6);filter.type='lowpass';filter.frequency.value=220;o.connect(filter);filter.connect(g);g.connect(audioContext.destination);g.gain.setValueAtTime(.001,audioContext.currentTime);g.gain.linearRampToValueAtTime(.045,audioContext.currentTime+.25);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.start();o.stop(audioContext.currentTime+duration+.1);}catch{/* Audio is optional. */}
}
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.remove('hidden');$('#toast').classList.toggle('error',error);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3300);if(error)beep('error');}

function worldPosition(obj){return new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());}
function targetPosition(s=session.step){
  if(!s)return new THREE.Vector3();
  if(s.operation==='install'){
    const rec=world.partObjects.get(s.part);
    return rec.homeParent.localToWorld(rec.homePosition.clone());
  }
  if(s.id==='engine_install')return new THREE.Vector3(0,.68,-1.28);
  return worldPosition(world.targets.get(s.target));
}
function distance(){return session.step?camera.position.distanceTo(targetPosition()):Infinity;}
function canReach(){return distance()<3.05;}
function usable(){return session.arrived&&!busy&&!traveling&&!modalOpen&&!session.completed;}
function showTool(id,silent=false){session.selectTool(id);heldTools.forEach((g,key)=>g.visible=key===id);document.querySelectorAll('.tool').forEach(b=>{const selected=b.dataset.tool===id;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});updateTask();if(!silent)beep();}
function renderToolbar(){
  $('#toolbar').innerHTML=TOOLS.map(t=>`<button class="tool ${t.id===session.tool?'selected':''}" data-tool="${t.id}" title="${t.name} (${t.key})" aria-label="${t.name}" aria-pressed="${t.id===session.tool}"><span class="tool-key">${t.key}</span>${icon(t.icon)}<span class="tool-name">${t.name}</span></button>`).join('');
  document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{stopHold();showTool(b.dataset.tool);}));
}
renderToolbar();
function updateTask(){
  const s=session.step;if(!s)return;
  $('#free-steps')?.classList.toggle('hidden',session.mode!=='free');
  $('#diagnosis-open')?.classList.toggle('hidden',session.mode!=='diagnostic'||!session.diagnosed);
  $('#task-title').textContent=s.title;$('#task-description').textContent=s.description;
  $('#chapter-label').textContent=`0${s.chapter+1} / ${CHAPTERS[s.chapter].toUpperCase()}`;$('#step-count').textContent=`${String(session.index+1).padStart(2,'0')} / ${session.steps.length}`;
  const tool=TOOLS.find(t=>t.id===s.tool);$('#required-tool-name').textContent=tool.name;$('#required-tool>span:first-child').innerHTML=icon(tool.icon);$('#required-tool').classList.toggle('ready',s.tool===session.tool);
  const progress=Math.round(session.progress*100);$('#progress-percent').textContent=progress+'%';$('#progress-bar').style.width=progress+'%';
  $('#chapters').innerHTML=CHAPTERS.map((name,i)=>`<li class="${i<s.chapter?'done':i===s.chapter?'active':''}"><span class="chapter-number">${i<s.chapter?'✓':String(i+1).padStart(2,'0')}</span>${name}</li>`).join('');
  $('#fault-text').textContent=session.tested?'Двигатель исправен':session.diagnosed?JOBS[session.jobId].fault:JOBS[session.jobId].symptoms;
  $('#marker-name').textContent=s.title;
  updateActionButton();
}
function updateActionButton(){
  const s=session.step;if(!s)return;
  $('#action-button').disabled=!session.arrived||busy||traveling||session.completed;
  if(!session.arrived)$('#action-label').textContent='Дождись автомобиля';
  else if(traveling)$('#action-label').textContent='Подходим к детали…';
  else if(busy)$('#action-label').textContent='Выполняем…';
  else if(!canReach())$('#action-label').textContent='Сначала подойди к детали';
  else if(session.tool!==s.tool)$('#action-label').textContent=`Выбрать: ${TOOLS.find(t=>t.id===s.tool).name}`;
  else $('#action-label').textContent='Удерживай, чтобы выполнить';
}
async function focusTarget(){
  if(!usable())return;
  stopHold();traveling=true;focused=true;updateActionButton();unlock();
  const s=session.step,p=targetPosition(),eye=p.clone();
  if(s.target==='lift')eye.add(new THREE.Vector3(-1.0,.35,-1.25));
  else if(s.id.includes('drain'))eye.add(new THREE.Vector3(-1.05,-.6,-1.15));
  else if(s.target==='exit')eye.add(new THREE.Vector3(-.9,.1,-2.3));
  else if(s.target==='crane')eye.add(new THREE.Vector3(-1.45,.4,-1.5));
  else if(s.target==='stand')eye.add(new THREE.Vector3(-1.4,.7,-1.4));
  else if(s.target==='new_part')eye.add(new THREE.Vector3(-1,.7,-1));
  else if(s.target==='hood')eye.set(-1.65,1.85,-3.25);
  else if(session.engineLocation==='stand'&&PARTS.some(part=>part.id===s.part))eye.add(new THREE.Vector3(-.95,.72,-1.15));
  else eye.add(new THREE.Vector3(-1.3,.83,-1.38));
  eye.x=THREE.MathUtils.clamp(eye.x,-6.4,6.4);eye.z=THREE.MathUtils.clamp(eye.z,-7.3,7.3);eye.y=THREE.MathUtils.clamp(eye.y,.6,2.6);
  const startPos=camera.position.clone(),startQuat=camera.quaternion.clone();const temp=camera.clone();temp.position.copy(eye);temp.lookAt(p);const endQuat=temp.quaternion.clone();const t={a:0};
  await anim(t,{a:1},750,()=>{camera.position.lerpVectors(startPos,eye,t.a);camera.quaternion.slerpQuaternions(startQuat,endQuat,t.a);});
  traveling=false;updateActionButton();
}
function unlock(){if(document.pointerLockElement===canvas)document.exitPointerLock();}
function openModal(html){stopHold();unlock();keys.clear();modalReturnFocus=document.activeElement;modalOpen=true;$('#modal-body').innerHTML=html;$('#modal-backdrop').classList.remove('hidden');$('#modal-close').focus();}
function closeModal(){modalOpen=false;$('#modal-backdrop').classList.add('hidden');if(modalReturnFocus instanceof HTMLElement)modalReturnFocus.focus();if(session.started&&!session.completed&&session.arrived&&autoFocus&&!busy)focusTarget();}
$('#modal-close').addEventListener('click',closeModal);
function handleBack(){
  if(modalOpen){closeModal();return;}
  if(session.started&&!session.completed){$('#pause-button')?.click();return;}
  unlock();
}
document.addEventListener('backbutton',handleBack);
try{window.Capacitor?.Plugins?.App?.addListener?.('backButton',handleBack);}catch(e){console.warn('Native Back listener unavailable',e);}

$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
function diagnosisModal(){
  const job=JOBS[session.jobId];
  if(session.mode==='guided'){
    openModal(`<div class="eyebrow">РЕЗУЛЬТАТ ДИАГНОСТИКИ</div><h2 id="modal-title">Нашли проблему.</h2><p>Перегрев и антифриз в масле указывают на повреждение прокладки ГБЦ. Тебе предстоит разобрать двигатель.</p><div class="diagnosis-code"><b>P0302</b><span>Пропуски воспламенения<br>Цилиндр № 2</span></div><button class="primary-button" id="diagnosis-continue">К РЕМОНТУ →</button>`);
    $('#diagnosis-continue').onclick=closeModal;return;
  }
  openModal(`<div class="eyebrow">ДИАГНОСТИКА / ${MODES[session.mode]}</div><h2 id="modal-title">Определи неисправность.</h2><p>${job.symptoms} Сканер показывает симптомы, а не готовый диагноз.</p><div class="diagnostic-options">${Object.values(JOBS).filter(j=>j.id!=='gasket').map(j=>`<button class="secondary-button" data-hypothesis="${j.id}">${j.fault}</button>`).join('')}</div><p id="hypothesis-feedback" class="help-note">Выбери вероятную причину. Неверные ответы фиксируются, но заказ можно продолжать.</p><button class="primary-button" id="diagnosis-continue">ПРОДОЛЖИТЬ →</button>`);
  document.querySelectorAll('[data-hypothesis]').forEach(button=>button.onclick=()=>{
    const correct=session.setHypothesis(button.dataset.hypothesis);
    $('#hypothesis-feedback').textContent=correct?'Верно! Причина подтверждена.':'Не совпадает с симптомами. Попробуй ещё раз.';
    if(correct)saveGame('auto',true);
  });
  $('#diagnosis-continue').onclick=()=>{
    if(session.mode==='diagnostic'&&session.hypothesis!==session.jobId){toast('Сначала подтверди диагноз.',true);return;}
    closeModal();
  };
}
function testModal(){openModal(`<div class="eyebrow">КОНТРОЛЬНЫЙ ЗАПУСК</div><h2 id="modal-title">Работает как надо.</h2><p>Двигатель собран, жидкости залиты. Повторная диагностика завершена — машину можно отдавать клиенту.</p><div class="modal-grid"><div class="stat"><small>ОШИБКИ OBD</small><strong class="good">0 ошибок</strong></div><div class="stat"><small>ХОЛОСТОЙ ХОД</small><strong class="good">820 об/мин</strong></div><div class="stat"><small>ТЕМПЕРАТУРА</small><strong>89 °C</strong></div><div class="stat"><small>ГЕРМЕТИЧНОСТЬ</small><strong class="good">В норме</strong></div></div><button class="primary-button" id="test-continue">ВЕРНУТЬСЯ В МАСТЕРСКУЮ →</button>`);$('#test-continue').onclick=closeModal;}

async function begin(options={}){
  if(session.started)return;
  if(!options.preserveExisting){
    const selectedMode=$('#mode-choice')?.value||'guided';
    const selectedJob=selectedMode==='guided'?'gasket':($('#job-choice')?.value||'ignition');
    session.reset(selectedJob,selectedMode);
  }
  showTool(session.tool,true);
  if(!session.begin())return;
  document.body.classList.add('playing');['#welcome','#welcome-order','#welcome-footer'].forEach(id=>$(id).classList.add('hidden'));$('#hud').classList.remove('hidden');$('#arrival').classList.remove('hidden');
  busy=true;world.car.position.z=12;world.contact.position.z=12;world.door.position.y=4.5;motorSound(4.2);
  const arrival={z:12};await anim(arrival,{z:0},4000,()=>{world.car.position.z=arrival.z;world.contact.position.z=arrival.z;world.wheels.forEach(w=>w.rotation.x=arrival.z/.405);});
  world.wheels.forEach(w=>w.rotation.x=0);await anim(world.door.position,{y:0},900);
  session.arrived=true;busy=false;$('#arrival').classList.add('hidden');updateTask();saveGame('auto',true);toast('Заказ принят. Выбери OBD-сканер и начни диагностику.');focusTarget();
}
$('#start-button').addEventListener('click',begin);
const modeChoice=$('#mode-choice'),jobChoice=$('#job-choice');
if(modeChoice&&jobChoice){
  modeChoice.innerHTML=Object.entries(MODES).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
  jobChoice.innerHTML=Object.values(JOBS).filter(j=>j.id!=='gasket').map(j=>`<option value="${j.id}">${j.title}</option>`).join('');
  function updateWelcomeJob(){
    jobChoice.disabled=modeChoice.value==='guided';
    const job=JOBS[modeChoice.value==='guided'?'gasket':(jobChoice.value||'ignition')];
    if(job){$('#welcome-order .fault strong').textContent=job.title;$('#welcome-order .fault p').textContent=job.symptoms;}
  }
  modeChoice.addEventListener('change',updateWelcomeJob);jobChoice.addEventListener('change',updateWelcomeJob);
  updateWelcomeJob();
}
function cameraSnapshot(){return [...camera.position.toArray(),camera.rotation.x,camera.rotation.y];}
async function saveGame(slot='auto',silent=false){
  if(!session.started||!session.arrived||gpuLost)return false;
  try{await saveStore.write(slot,createSave(slot,session,{elapsed:gameElapsed,camera:cameraSnapshot(),quality,sensitivity,muted}));
    if(!silent)toast(`Сохранено: ${slot==='auto'?'автоматически':slot.toUpperCase()}`);autosaveErrorShown=false;return true;
  }catch(e){console.warn('Save failed',e);if(!autosaveErrorShown){toast(`Прогресс не сохранён: ${e.message}`,true);autosaveErrorShown=true;}return false;}
}
async function resumeSave(slot){
  if(busy||session.started)return;
  try{
    const save=await saveStore.read(slot);if(!save)throw new Error('Слот пуст');
    session.restore(save.session);gameElapsed=save.elapsed;
    quality=save.settings.quality;sensitivity=save.settings.sensitivity;muted=save.settings.muted;
    setQuality(quality);showTool(session.tool,true);
    document.body.classList.add('playing');['#welcome','#welcome-order','#welcome-footer'].forEach(id=>$(id).classList.add('hidden'));
    $('#hud').classList.remove('hidden');$('#arrival').classList.add('hidden');
    applyCommittedState(world,session);
    camera.position.fromArray(save.camera,0);camera.rotation.set(save.camera[3],save.camera[4],0,'YXZ');
    updateTask();$('#session-time').textContent=formatTime(gameElapsed);
    if(session.completed)finish();else toast('Ремонт восстановлен. Все детали на местах.');
  }catch(e){console.error('Load failed',e);toast(`Не удалось загрузить сохранение: ${e.message}`,true);}
}
async function refreshContinue(){
  try{const save=await saveStore.read('auto');$('#continue-button').classList.toggle('hidden',!save);}
  catch(e){console.warn('Save list unavailable',e);$('#continue-button').classList.add('hidden');}
}
$('#continue-button')?.addEventListener('click',()=>resumeSave('auto'));
async function showProfile(){
  let profile=session.profile;
  if(!session.started)try{const existing=await saveStore.read('auto');if(existing)profile=new RepairSession().restore(existing.session).profile;}catch{}
  openModal(`<div class="eyebrow">ПРОФИЛЬ МАСТЕРА</div><h2 id="modal-title">Статистика мастерской</h2><div class="modal-grid"><div class="stat"><small>БАЛАНС</small><strong>${profile.balance} ₡</strong></div><div class="stat"><small>РЕПУТАЦИЯ</small><strong>${profile.reputation}/100</strong></div><div class="stat"><small>ЗАКАЗОВ В КАРЬЕРЕ</small><strong>${profile.orders.length}</strong></div><div class="stat"><small>РЕКОРДОВ</small><strong>${Object.keys(profile.bestTimes).length}</strong></div></div><h3>Последние заказы</h3><ul class="journal-list">${profile.orders.slice(-15).reverse().map(o=>`<li>${JOBS[o.jobId].title} — +${o.earned} ₡ / ${formatTime(o.elapsed)}</li>`).join('')||'<li>Пока заказов нет.</li>'}</ul><h3>Испытания на время</h3><ul class="journal-list">${Object.entries(profile.bestTimes).map(([job,time])=>`<li>${JOBS[job].title}: ${formatTime(time)}</li>`).join('')||'<li>Рекордов пока нет.</li>'}</ul>`);
}
$('#profile-menu')?.addEventListener('click',showProfile);
function slotName(slot){return slot==='auto'?'Автосохранение':`Слот ${slot.slice(-1)}`;}
async function saveMenu(){
  let slots;try{slots=await saveStore.list();}catch(e){toast('Сохранения недоступны.',true);return;}
  openModal(`<div class="eyebrow">ЛОКАЛЬНОЕ ХРАНИЛИЩЕ</div><h2 id="modal-title">Сохранения</h2><p>Прогресс хранится на этом устройстве. Создай резервную копию перед удалением приложения.</p><div class="save-list">${SAVE_SLOTS.map(slot=>{
    const item=slots.find(s=>s.slot===slot);return `<div class="save-item"><strong>${slotName(slot)}</strong><small>${item?.corrupted?'Повреждено':item?new Date(item.updatedAt).toLocaleString('ru-RU')+' · '+item.progress+' действий':'Пустой слот'}</small><div class="save-buttons"><button data-slot-load="${slot}" ${!item||item.corrupted?'disabled':''}>Загрузить</button><button data-slot-save="${slot}" ${!session.started?'disabled':''}>Сохранить</button><button data-slot-export="${slot}" ${!item||item.corrupted?'disabled':''}>Экспорт</button><button data-slot-delete="${slot}" ${!item?'disabled':''}>Удалить</button></div></div>`;
  }).join('')}</div><label class="secondary-button" for="import-save">Импорт JSON</label><input id="import-save" type="file" accept="application/json,.json" />`);
  document.querySelectorAll('[data-slot-load]').forEach(b=>b.onclick=()=>{const slot=b.dataset.slotLoad;closeModal();if(session.started)toast('Загрузку во время ремонта выполняй через главное меню.',true);else resumeSave(slot);});
  document.querySelectorAll('[data-slot-save]').forEach(b=>b.onclick=async()=>{await saveGame(b.dataset.slotSave);closeModal();});
  document.querySelectorAll('[data-slot-delete]').forEach(b=>b.onclick=async()=>{
    if(!window.confirm?.(`Удалить ${slotName(b.dataset.slotDelete)}?`))return;
    try{await saveStore.remove(b.dataset.slotDelete);closeModal();refreshContinue();toast('Сохранение удалено.');}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll('[data-slot-export]').forEach(b=>b.onclick=async()=>{
    try{const content=await saveStore.exportSlot(b.dataset.slotExport);const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`garage-life-${b.dataset.slotExport}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    }catch(e){toast(e.message,true);}
  });
  $('#import-save').addEventListener('change',async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{await saveStore.importSlot('slot3',await f.text());closeModal();refreshContinue();toast('Резервная копия загружена в слот 3.');}
    catch(err){toast(`Ошибка импорта: ${err.message}`,true);}
  });
}
$('#saves-menu')?.addEventListener('click',saveMenu);$('#saves-open')?.addEventListener('click',saveMenu);$('#save-now')?.addEventListener('click',()=>saveGame('auto'));
$('#pause-button')?.addEventListener('click',()=>openModal(`<div class="eyebrow">ПАУЗА</div><h2 id="modal-title">Мастерская ждёт</h2><p>Прогресс сохраняется после каждого выполненного действия.</p><button id="resume-game" class="primary-button">Вернуться к ремонту</button><button id="manual-save" class="secondary-button">Сохранить сейчас</button>`));
// The handler is attached by modal delegation because the pause dialog is dynamic.
$('#modal-body')?.addEventListener('click',e=>{if(e.target.id==='resume-game')closeModal();if(e.target.id==='manual-save')saveGame('auto');});
refreshContinue();

$('#focus-button').addEventListener('click',focusTarget);
$('#world-marker').addEventListener('click',()=>{if(!canReach()){focusTarget();return;}if(session.tool!==session.step.tool){showTool(session.step.tool);return;}toast('Удерживай E или оранжевую кнопку, чтобы выполнить действие.');});
$('#auto-focus').addEventListener('change',e=>autoFocus=e.target.checked);
$('#job-collapse').addEventListener('click',()=>$('.job-panel').classList.toggle('collapsed'));

function startHold(source){
  if(!usable()||held)return;
  if(!canReach()){focusTarget();return;}
  if(session.tool!==session.step.tool){showTool(session.step.tool);toast('Инструмент выбран. Теперь удерживай действие.');return;}
  const result=session.check(session.step.target);if(!result.ok){toast(result.reason,true);return;}
  held=true;holdSource=source;hold=0;beep(session.tool==='ratchet'?'ratchet':'click');
}
function stopHold(){held=false;holdSource=null;hold=0;$('.action-progress').style.width='0%';}
$('#action-button').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();$('#action-button').setPointerCapture?.(e.pointerId);startHold('button');});
$('#action-button').addEventListener('pointerup',()=>{if(holdSource==='button')stopHold();});
$('#action-button').addEventListener('pointercancel',stopHold);
$('#action-button').addEventListener('lostpointercapture',()=>{if(holdSource==='button')stopHold();});
// Enter / Space allow keyboard-only users to use the focused action button.
$('#action-button').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();if(!e.repeat)startHold('button-key');}});
$('#action-button').addEventListener('keyup',e=>{if(['Enter',' '].includes(e.key))stopHold();});

async function animatePart(s){
  const rec=world.partObjects.get(s.part);let o=rec.object;
  if(s.operation==='remove'){
    scene.attach(o);const liftY=o.position.y+.32;await anim(o.position,{y:liftY},230);
    const index=PARTS.findIndex(p=>p.id===s.part),column=index%6,row=Math.floor(index/6);
    const destination={x:4.05+column*.39,y:1.17+row*.08,z:-3.83+row*.24};
    await Promise.all([anim(o.position,destination,550),anim(o.scale,{x:.38,y:.38,z:.38},550)]);
  }else{
    if(session.replacedParts.has(s.part)&&rec.object===(rec.original??rec.object)){
      rec.original??=rec.object;
      const fresh=rec.original.clone(true);scene.add(fresh);
      fresh.position.copy(new THREE.Vector3(4.8,1.4,-3.45));fresh.scale.setScalar(.38);
      rec.object=fresh;o=fresh;world.targets.set(s.part,fresh);
    }
    const dest=rec.homeParent.localToWorld(rec.homePosition.clone());
    await Promise.all([anim(o.position,{x:dest.x,y:dest.y+.25,z:dest.z},500),anim(o.scale,{x:1,y:1,z:1},500)]);
    await anim(o.position,{y:dest.y},250);rec.homeParent.attach(o);o.position.copy(rec.homePosition);o.quaternion.copy(rec.homeRotation);o.scale.setScalar(1);

  }
}
async function animateBolt(s){
  const b=world.bolts.get(s.target);if(!b)return;
  const removing=s.operation==='unbolt'||s.operation==='mount_out';
  b.visible=true;await Promise.all([anim(b.rotation,{y:b.rotation.y+(removing?-Math.PI*4:Math.PI*4)},500),anim(b.position,{y:b.userData.home.y+(removing?.1:0)},500)]);if(removing)b.visible=false;
}
async function fluidsAnimation(p,color){
  const geo=new THREE.CylinderGeometry(.013,.02,.6,8),mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8});const stream=new THREE.Mesh(geo,mat);stream.position.copy(p);stream.position.y-=.3;scene.add(stream);
  await anim(stream.scale,{y:.04},550);scene.remove(stream);geo.dispose();mat.dispose();
}
async function animateStep(s){
  if(s.operation==='remove'||s.operation==='install')return animatePart(s);
  if(['unbolt','bolt','mount_out','mount_in'].includes(s.operation))return animateBolt(s);
  if(s.id==='hood_open')return anim(world.hood.rotation,{x:1.13},700);
  if(s.id==='hood_close')return anim(world.hood.rotation,{x:.02},700);
  if(s.id==='lift_up'||s.id==='lift_down'){
    const y=s.id==='lift_up'?1.2:0;return Promise.all([anim(world.car.position,{y},1400),anim(world.arms.position,{y},1400),anim(world.contact.material,{opacity:y?.45:1},1400)]);
  }
  if(s.id==='oil_drain'||s.id==='coolant_drain')return fluidsAnimation(targetPosition(s),s.id==='oil_drain'?0x6b4e2b:0x67b5a2);
  if(s.id==='refill')return fluidsAnimation(new THREE.Vector3(.05,1.65,-1.28),0xcabf86);
  if(s.id==='crane_move')return anim(world.crane.position,{x:0,z:0},1400);
  if(s.id==='engine_out'){scene.attach(world.engine);await anim(world.engine.position,{y:1.95},1400);}
  if(s.id==='engine_stand'){
    await Promise.all([anim(world.crane.position,{x:3.55,z:.25},1500),anim(world.engine.position,{x:3.55,z:-1.03},1500)]);await anim(world.engine.position,{y:1.32},650);await anim(world.crane.position,{x:4.4,z:1.8},700);
  }
  if(s.id==='new_gasket'){world.newPart.visible=false;toast('Новая прокладка готова к установке.');}
  if(s.id==='engine_return'){
    await anim(world.crane.position,{x:3.55,z:.25},700);await anim(world.engine.position,{y:1.95},700);await Promise.all([anim(world.crane.position,{x:0,z:0},1400),anim(world.engine.position,{x:0,z:-1.28},1400)]);
  }
  if(s.id==='engine_install'){
    await anim(world.engine.position,{x:0,y:.68,z:-1.28},1200);world.car.attach(world.engine);world.engine.position.set(0,.68,-1.28);await anim(world.crane.position,{x:3.7,z:2.7},900);
  }
  if(s.id==='test'){motorSound(4);const rumble={x:0};await anim(rumble,{x:1},1100,()=>world.car.rotation.z=Math.sin(rumble.x*90)*.0007);world.car.rotation.z=0;}
  if(s.id==='deliver'){
    world.highlight.visible=false;$('#world-marker').classList.add('hidden');await anim(world.door.position,{y:4.5},900);motorSound(4);const departure={z:0};await anim(departure,{z:13},3300,()=>{world.car.position.z=departure.z;world.contact.position.z=departure.z;world.wheels.forEach(w=>w.rotation.x=departure.z/.405);});
  }
}
async function completeAction(){
  if(busy||!session.step)return;
  const s=session.step,target=s.target,valid=session.check(target);
  if(!valid.ok){stopHold();toast(valid.reason,true);return;}
  stopHold();busy=true;world.highlight.visible=false;$('#world-marker').classList.add('hidden');updateActionButton();
  try{
    // Two-phase action: until animation succeeds the model stays unchanged.
    await animateStep(s);
    const result=session.perform(target);
    if(!result.ok)throw new Error(result.reason);
    applyCommittedState(world,session); // canonical transforms, no animation drift
    busy=false;beep('done');updateTask();saveGame('auto',true);
    if(result.complete){finish();return;}
    if(s.id==='scan'){diagnosisModal();return;}
    if(s.id==='test'){testModal();return;}
    if(session.mode==='free'&&session.availableSteps.length>1){showAvailableSteps();return;}
    if(autoFocus)await focusTarget();
  }catch(error){
    console.error('Repair action rolled back',error);
    applyCommittedState(world,session);busy=false;updateTask();
    toast('Действие не удалось. Детали возвращены в последнее сохранённое состояние.',true);
  }
}
function showAvailableSteps(){
  const ready=session.availableSteps;if(!ready.length)return;
  openModal(`<div class="eyebrow">СВОБОДНЫЙ РЕМОНТ</div><h2 id="modal-title">Выбери следующий шаг</h2><p>Доступные действия зависят от уже выполненного ремонта.</p><div class="diagnostic-options">${ready.map(s=>`<button class="secondary-button" data-next-step="${s.id}">${s.title}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-next-step]').forEach(b=>b.onclick=()=>{
    session.chooseStep(b.dataset.nextStep);closeModal();updateTask();saveGame('auto',true);
  });
}
$('#free-steps')?.addEventListener('click',showAvailableSteps);
$('#diagnosis-open')?.addEventListener('click',diagnosisModal);
function formatTime(seconds){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
function finish(){
  const reward=session.recordCompletion(gameElapsed);
  saveGame('auto',true);
  $('#progress-percent').textContent='100%';$('#progress-bar').style.width='100%';
  $('#task-title').textContent='Заказ выполнен';$('#task-description').textContent='Автомобиль передан клиенту.';$('#action-button').disabled=true;
  const report=reward&&session.mode==='career'?`<div class="stat"><small>ЗАРАБОТАНО</small><strong class="good">+${reward.earned} ₡</strong></div><div class="stat"><small>БАЛАНС</small><strong>${reward.balance} ₡</strong></div>`:
    session.mode==='challenge'?`<div class="stat"><small>ЛУЧШЕЕ ВРЕМЯ</small><strong class="good">${formatTime(session.profile.bestTimes[session.jobId])}</strong></div>`:'';
  openModal(`<div class="eyebrow">ЗАКАЗ / ЗАВЕРШЁН</div><h2 id="modal-title">Хорошая работа, мастер.</h2><p>KOVA S4 снова в строю. Выполнен заказ «${JOBS[session.jobId].title}».</p><div class="modal-grid"><div class="stat"><small>ВРЕМЯ РЕМОНТА</small><strong>${formatTime(gameElapsed)}</strong></div><div class="stat"><small>ДЕЙСТВИЙ</small><strong>${session.actions}</strong></div><div class="stat"><small>РЕЖИМ</small><strong>${MODES[session.mode]}</strong></div><div class="stat"><small>РЕЗУЛЬТАТ</small><strong class="good">Исправен</strong></div>${report}</div>${session.mode==='career'?'<button class="primary-button" id="next-career">СЛЕДУЮЩИЙ ЗАКАЗ ↗</button>':''}<button class="secondary-button" id="new-session">НОВАЯ СМЕНА</button><button class="secondary-button" id="stay-garage">Остаться в мастерской</button>`);
  $('#new-session').onclick=async()=>{try{await saveStore.remove('auto');}catch{}location.reload();};
  $('#stay-garage').onclick=closeModal;
  if(session.mode==='career')$('#next-career').onclick=()=>{
    const next=session.nextCareerJob();if(!next)return;
    gameElapsed=0;closeModal();applyCommittedState(world,session);begin({preserveExisting:true});
  };
}

$('#help-open').addEventListener('click',()=>openModal(`<div class="eyebrow">КАК ИГРАТЬ</div><h2 id="modal-title">Освойся в мастерской.</h2><p>Следуй текущей задаче справа. Кнопка «К месту работы» подведёт к нужной детали. Выбери инструмент и удерживай действие до заполнения полосы.</p><div class="help-row"><span>Движение</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></div><div class="help-row"><span>Осмотр</span><span>Нажать на сцену + мышь</span></div><div class="help-row"><span>Действие / инструмент</span><span><kbd>E</kbd><kbd>1–4</kbd></span></div><div class="help-row"><span>К текущей детали</span><span><kbd>F</kbd></span></div><div class="help-row"><span>Вернуть курсор</span><span><kbd>Esc</kbd></span></div><p class="help-note">На телефоне: левый джойстик — движение, «Осмотр» — поворот камеры. Можно проходить ремонт кнопками панели. Сессия сохраняется автоматически; копию можно экспортировать из меню сохранений.</p><p class="help-note">Игровая модель ремонта упрощена: это не инструкция по ремонту реального автомобиля.</p>`));
function settings(){openModal(`<div class="eyebrow">ПОД СЕБЯ</div><h2 id="modal-title">Настройки мастерской</h2><div class="settings-row"><label>Качество графики</label><div class="segmented">${[['low','Быстро'],['balanced','Баланс'],['high','Красиво']].map(([id,name])=>`<button data-quality="${id}" class="${id===quality?'active':''}">${name}</button>`).join('')}</div></div><div class="settings-row"><label for="sensitivity">Чувствительность мыши</label><input id="sensitivity" type="range" min="0.3" max="2" step="0.1" value="${sensitivity}"></div><div class="settings-row"><label>Звук мастерской</label><div class="segmented"><button id="audio-setting">${muted?'Включить звук':'Выключить звук'}</button></div></div><p class="settings-foot">«Быстро» отключает тени и уменьшает разрешение. «Красиво» включает тени и более чёткое изображение. Настройки сохраняются в автослоте после следующего действия.</p><p class="settings-foot">Three.js · Tween.js · предметы Kenney (CC0). <a href="./credits.html" target="_blank" rel="noopener">Авторы и лицензии ↗</a></p>`);
  document.querySelectorAll('[data-quality]').forEach(b=>b.onclick=()=>{setQuality(b.dataset.quality);document.querySelectorAll('[data-quality]').forEach(el=>el.classList.toggle('active',el.dataset.quality===quality));});$('#sensitivity').oninput=e=>{sensitivity=+e.target.value;saveGame('auto',true);};$('#audio-setting').onclick=()=>{toggleAudio();$('#audio-setting').textContent=muted?'Включить звук':'Выключить звук';};
}
function setQuality(q){quality=q;world.setTextureQuality?.(q);renderer.setPixelRatio(q==='low'?.85:Math.min(devicePixelRatio,q==='balanced'?1:1.5));renderer.shadowMap.enabled=q!=='low';world.key.shadow.mapSize.set(q==='high'?2048:1024,q==='high'?2048:1024);if(world.key.shadow.map){world.key.shadow.map.dispose();world.key.shadow.map=null;}world.dust.visible=q==='high';renderer.setSize(innerWidth,innerHeight);saveGame('auto',true);scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}});}
setQuality(quality);
$('#settings-open').addEventListener('click',settings);
function toggleAudio(){muted=!muted;$('#sound-toggle').innerHTML=icon(muted?'volumeOff':'volume');$('#sound-toggle').title=muted?'Включить звук':'Выключить звук';$('#sound-toggle').setAttribute('aria-label',$('#sound-toggle').title);saveGame('auto',true);beep();}
$('#sound-toggle').addEventListener('click',toggleAudio);
$('#journal-open').addEventListener('click',()=>{
  openModal(`<div class="eyebrow">ЗАКАЗ № 001 · ${MODES[session.mode]}</div><h2 id="modal-title">Журнал ремонта</h2><p>Выполнено ${session.index} из ${session.steps.length} действий. ${session.diagnosed?JOBS[session.jobId].fault:'Диагностика не выполнена.'}</p><ul class="journal-list">${session.history.map((h,i)=>`<li><span class="check">✓</span><span>${i+1}. ${session.steps.find(s=>s.id===h.id)?.title||h.id} <small>${new Date(h.at).toLocaleTimeString('ru-RU')}</small></span></li>`).join('')}</ul><p class="help-note">Снято узлов: ${session.removed.size}. Ошибочных гипотез: ${session.wrongHypotheses}.</p>`);
});
$('.brand').addEventListener('click',e=>{e.preventDefault();if(session.started)toast('Ты уже в мастерской. Продолжай текущий заказ.');});

// First-person controls. Pointer Lock has a drag-look fallback for embedded browsers.
canvas.addEventListener('pointerdown',e=>{
  if(!session.started||modalOpen||busy||traveling)return;
  if(e.pointerType==='touch'){dragging=true;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;}
  if(document.pointerLockElement!==canvas){try{const result=canvas.requestPointerLock();result?.catch(()=>toast('Зажми мышь на сцене и двигай её для осмотра.'));}catch{toast('Зажми мышь на сцене для осмотра.');}dragging=true;lastPointer={x:e.clientX,y:e.clientY};}
});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
function look(dx,dy){if(!session.started||modalOpen||traveling||busy)return;focused=false;camera.rotation.y-=dx*.002*sensitivity;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-dy*.002*sensitivity,-1.35,1.35);camera.rotation.z=0;}
document.addEventListener('pointermove',e=>{if(document.pointerLockElement===canvas)look(e.movementX,e.movementY);else if(dragging){look(e.clientX-lastPointer.x,e.clientY-lastPointer.y);lastPointer={x:e.clientX,y:e.clientY};}});
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;document.body.classList.toggle('pointer-locked',locked);$('#crosshair').classList.toggle('hidden',!locked);if(!locked){keys.clear();stopHold();}});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(modalOpen)closeModal();else unlock();stopHold();return;}
  if(modalOpen){
    if(e.key==='Tab'){const nodes=[...$('#modal').querySelectorAll('button,a,input')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    return;
  }
  if(!session.started)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyF','Space'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.repeat)return;
  if(/^Digit[1-4]$/.test(e.code)){stopHold();showTool(TOOLS[+e.code.slice(-1)-1].id);}
  if(e.code==='KeyF')focusTarget();if(e.code==='KeyE')startHold('keyboard');
});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyE'&&holdSource==='keyboard')stopHold();});
window.addEventListener('blur',()=>{keys.clear();joy.x=joy.y=0;dragging=false;stopHold();saveGame('auto',true);});
window.addEventListener('pagehide',()=>saveGame('auto',true));
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){keys.clear();stopHold();pausedAt??=performance.now();saveGame('auto',true);}
  else if(pausedAt!==null){pausedMs+=performance.now()-pausedAt;pausedAt=null;clock.getDelta();}
});
const joystick=$('#joystick'),knob=$('#joystick-knob');let joyPointer=null;
function moveJoy(e){const rect=joystick.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2,d=Math.hypot(dx,dy),scale=Math.min(1,28/Math.max(d,1));joy.x=dx*scale/28;joy.y=dy*scale/28;knob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;}
joystick.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoy(e);});joystick.addEventListener('pointermove',e=>{if(joyPointer===e.pointerId)moveJoy(e);});
function resetJoy(){joyPointer=null;joy.x=joy.y=0;knob.style.transform='';}joystick.addEventListener('pointerup',resetJoy);joystick.addEventListener('pointercancel',resetJoy);
let lookPointer=null,lookLast={x:0,y:0};const touchLook=$('#touch-look');touchLook.addEventListener('pointerdown',e=>{lookPointer=e.pointerId;lookLast={x:e.clientX,y:e.clientY};touchLook.setPointerCapture(e.pointerId);});touchLook.addEventListener('pointermove',e=>{if(e.pointerId===lookPointer){look(e.clientX-lookLast.x,e.clientY-lookLast.y);lookLast={x:e.clientX,y:e.clientY};}});touchLook.addEventListener('pointerup',()=>lookPointer=null);touchLook.addEventListener('pointercancel',()=>lookPointer=null);
function blocked(x,z){
  if(Math.abs(x)>6.5||z<-7.4||z>7.3)return true;
  if(world.car.position.z<5&&Math.abs(x)<1.18&&Math.abs(z-world.car.position.z)<2.44&&session.lift===0)return true;
  if(x>3.55&&x<6.7&&z>-4.35&&z<-2.4)return true;
  if(x<-3.15&&x>-4.6&&z>-2.35&&z<-1.1)return true;
  if(x<-5.35&&z>1.2&&z<4.1)return true;
  if(Math.abs(x-2.7)<.35&&Math.abs(z-.5)<.5||Math.abs(x+2.7)<.35&&Math.abs(z-.5)<.5)return true;
  return false;
}
function movePlayer(dt){
  if(!session.started||modalOpen||traveling||busy||held)return;
  let x=+(keys.has('KeyD')||keys.has('ArrowRight'))-+(keys.has('KeyA')||keys.has('ArrowLeft'))+joy.x;
  let z=+(keys.has('KeyS')||keys.has('ArrowDown'))-+(keys.has('KeyW')||keys.has('ArrowUp'))+joy.y;
  const length=Math.hypot(x,z);if(length<.08)return;focused=false;
  x/=Math.max(1,length);z/=Math.max(1,length);const yaw=camera.rotation.y,speed=(keys.has('ShiftLeft')?3.8:2.2)*dt;
  const dx=(x*Math.cos(yaw)+z*Math.sin(yaw))*speed,dz=(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed;
  if(!blocked(camera.position.x+dx,camera.position.z))camera.position.x+=dx;
  if(!blocked(camera.position.x,camera.position.z+dz))camera.position.z+=dz;
  camera.position.y=THREE.MathUtils.damp(camera.position.y,1.7,7,dt);updateActionButton();
}
function updateTarget(){
  const s=session.step;if(!session.arrived||busy||traveling||session.completed||modalOpen||!s){world.highlight.visible=false;$('#world-marker').classList.add('hidden');return;}
  const obj=s.operation==='install'?world.installSlots.get(s.part):world.targets.get(s.target),pos=targetPosition(),p=pos.clone().project(camera);if(s.operation==='install'&&obj)obj.position.copy(pos);
  const visible=p.z<1&&p.z>-1&&Math.abs(p.x)<.93&&Math.abs(p.y)<.86;
  if(canReach()&&obj?.visible){world.highlight.setFromObject(obj);world.highlight.visible=true;}else world.highlight.visible=false;
  $('#world-marker').classList.toggle('hidden',!visible||document.pointerLockElement===canvas);
  if(visible){$('#world-marker').style.left=`${(p.x*.5+.5)*innerWidth}px`;$('#world-marker').style.top=`${(-p.y*.5+.5)*innerHeight-28}px`;}
  if(document.pointerLockElement===canvas){raycaster.setFromCamera(center,camera);const hits=obj?raycaster.intersectObjects([obj],true):[];$('#crosshair').style.borderColor=hits.length?'#efa16a':'#f5f5e744';}
  $('#scene-mode').textContent=focused?'РАБОТА С ДЕТАЛЬЮ':'СВОБОДНЫЙ ОСМОТР';
}
let lastRatchet=0;
function frame(time){
  requestAnimationFrame(frame);const elapsed=clock.getDelta(),dt=Math.min(elapsed,.05);if(document.hidden||gpuLost)return;tweens.update(activeClock(),false);
  if(session.started&&!session.completed&&!modalOpen&&!document.hidden){gameElapsed+=elapsed;$('#session-time').textContent=formatTime(gameElapsed);}
  if(!session.started){const t=time*.00008;camera.position.x=-5.4+Math.sin(t)*.18;camera.position.z=-5.8+Math.cos(t)*.14;camera.lookAt(.4,1,.1);}
  movePlayer(dt);
  if(held&&usable()){
    if(!canReach()){stopHold();toast('Подойди ближе к детали.',true);}else{
      hold+=dt*1000;$('.action-progress').style.width=`${Math.min(100,hold/session.step.duration*100)}%`;
      if(session.tool==='ratchet'&&time-lastRatchet>140){beep('ratchet');lastRatchet=time;}
      if(hold>=session.step.duration)completeAction();
    }
  }
  world.dust.rotation.y=Math.sin(time*.00003)*.018;
  handRig.visible=session.started&&session.arrived&&!modalOpen&&!traveling&&!session.completed;
  handRig.position.y=-.28+Math.sin(time*.002)*.002+(held?Math.sin(time*.017)*.012:0);
  handRig.rotation.z=-.12+(held&&session.tool==='ratchet'?Math.sin(time*.024)*.18:0);
  updateTarget();renderer.render(scene,camera);frameCount++;fpsElapsed+=elapsed;
  if(fpsElapsed>=.8){$('#fps').textContent=`${Math.round(frameCount/fpsElapsed)} FPS`;if($('#render-stats'))$('#render-stats').textContent=`${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles} triangles`;frameCount=0;fpsElapsed=0;}
}
requestAnimationFrame(frame);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopHold();saveGame('auto',true);gpuLost=true;toast('Потерян WebGL. Прогресс сохранён; после восстановления игра перезапустится.',true);});
canvas.addEventListener('webglcontextrestored',()=>{gpuLost=false;location.reload();});
// Read-only inspection surface for development and accessibility checks; no skip/cheat API.
Object.defineProperty(window,'garageLife',{value:Object.freeze({getState:()=>({index:session.index,total:session.steps.length,step:session.step?.id,tool:session.tool,started:session.started,arrived:session.arrived,completed:session.completed,removed:[...session.removed],busy,traveling,modalOpen,canReach:canReach(),camera:camera.position.toArray(),quality,assets:{...world.assetStatus},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},mode:session.mode,jobId:session.jobId,saveBackend:saveStore.backend})}),writable:false});
updateTask();
showTool('hands',true);
world.assetsReady.finally(()=>{const loader=$('#loader');loader.style.opacity='0';setTimeout(()=>loader.classList.add('hidden'),600);});
