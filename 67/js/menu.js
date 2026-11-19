import { setupSettings, pit, storage } from './game-settings.js?v=037';
import { FLEET } from './pit-save.js?v=037';
import { keyLabel } from './drive-bindings.js';
import { LESSONS, lessonInstruction } from './drift-school.js?v=037';

const $ = selector => document.querySelector(selector);
const bootStatus = $('#boot-status'), bootTitle = $('#boot-title'), loading = $('#loading'), retry = $('#startup-retry');
const neon = $('#neon-dialog'), practice = $('#practice-setup'), duo = $('#duo-setup');
const neonCar = $('#neon-car'), neonRoute = $('#neon-route');
const practiceCar = $('#practice-car'), practiceRoute = $('#practice-route'), practiceZone = $('#practice-zone');
const duoFirst = $('#duo-car-1'), duoSecond = $('#duo-car-2'), duoMode = $('#duo-mode');
const launchers = Array.from(document.querySelectorAll('[data-3d], #neon-open, #practice-open, #duo-open'));
let game, pending = false, lastLaunch;
let modules;
const tracks = () => modules ??= import('./track-selection.js?v=037');
setupSettings();

for (const input of [neonCar,practiceCar,duoFirst,duoSecond]) {
  for (const [id,car] of Object.entries(FLEET)) input.add(new Option(car.name,id));
}
duoSecond.value = 'cls';

function showBoot(state,title,message) {
  bootStatus.hidden = false;
  bootStatus.dataset.state = state;
  bootTitle.textContent = title;
  loading.textContent = message;
  retry.hidden = state!=='error';
}

async function launch(request, dialog) {
  if (pending) return;
  dialog?.close();
  lastLaunch = request;
  pending = true;
  for (const button of launchers) button.disabled = true;
  showBoot('loading','Готовим заезд','Запускаем 3D…');
  let slow = false;
  const wait = setTimeout(() => {
    slow = true;
    showBoot('loading','Готовим заезд','Загрузка заняла больше времени. Заезд откроется, когда трасса будет готова.');
  }, 12_000);
  const status = message => { if (!slow) loading.textContent = message; };
  try {
    if (!game) {
      const { boot } = await import('./drive.js?v=037');
      game = await boot();
    }
    await game.launch(request,status);
    bootStatus.hidden = true;
  } catch (error) {
    console.error('Garage launch failed',error);
    if (error?.code === 'webgl') {
      showBoot('error','3D недоступно в этом браузере','Нужен WebGL 2. В Chrome открой «Настройки → Система», включи аппаратное ускорение и перезапусти браузер. Меню и настройки игры доступны.');
    } else {
      showBoot('error','Не удалось открыть заезд','Проверь соединение и попробуй снова. Если ошибка повторится, обнови страницу.');
    }
    if (!document.querySelector('dialog[open]')) retry.focus({preventScroll:true});
    bootStatus.scrollIntoView({block:'nearest'});
  } finally {
    clearTimeout(wait);
    pending = false;
    for (const button of launchers) button.disabled = false;
  }
}

function drawPracticeNote() {
  const mode = $('#practice-form input[name="practice-mode"]:checked').value;
  $('#practice-free').hidden = mode!=='free';
  $('#practice-note').textContent = mode==='free'
    ? 'Тренируйся в своём темпе. T возвращает на выбранный участок.'
    : lessonInstruction(mode,matchMedia('(pointer: coarse)').matches ? '«Ручник»' : keyLabel(pit.keys[0].handbrake));
  if (mode==='free') void updatePracticeZones();
}

async function updatePracticeZones() {
  const value = practiceRoute.value;
  practiceZone.closest('label').hidden = value==='port';
  const selected = practiceZone.value;
  practiceZone.replaceChildren();
  try {
    const { practiceZones } = await tracks();
    if (practiceRoute.value!==value) return;
    practiceZone.replaceChildren(...practiceZones(value).map(([id,text])=>new Option(text,id)));
    if (Array.from(practiceZone.options).some(option=>option.value===selected)) practiceZone.value=selected;
    else if (value!=='main') practiceZone.value='0';
  } catch {
    practiceZone.add(new Option('Начало маршрута','0'));
  }
}

async function updateNeonPreview() {
  const value = neonRoute.value;
  try {
    const { describeNeonRoute } = await tracks();
    if (neonRoute.value!==value) return;
    const route = describeNeonRoute(value,storage);
    $('#neon-diagram').setAttribute('viewBox',route.viewBox);
    $('#neon-outline').setAttribute('d',route.path);
    for (const [key,value] of Object.entries({cx:route.x,cy:route.y,r:route.r})) $('#neon-origin').setAttribute(key,value);
    $('#neon-distance').textContent = route.distance;
    $('#neon-districts').textContent = route.details;
    for (const [selector,text] of [['#neon-best',route.record],['#neon-ghost-best',route.lap]]) {
      const element = $(selector);
      element.textContent = text;
      element.hidden = !text;
    }
  } catch {
    $('#neon-distance').textContent = 'Три круга';
    $('#neon-districts').textContent = '';
  }
}

$('#start').onclick = () => void launch({mode:'garage'});
$('#shift').onclick = () => void launch({mode:'workshop'});
$('#online-open').onclick = () => void launch({mode:'online'});
retry.onclick = () => { if (lastLaunch) void launch(lastLaunch); };

$('#neon-open').onclick = () => {
  neonCar.value = pit.selected;
  neon.showModal();
  void updateNeonPreview();
};
$('#neon-close').onclick = () => neon.close();
neonRoute.onchange = () => void updateNeonPreview();
$('#neon-friends').onclick = () => void launch({mode:'online',route:neonRoute.value,car:neonCar.value},neon);
$('#neon-form').onsubmit = event => {
  event.preventDefault();
  void launch({mode:'neon',route:neonRoute.value,car:neonCar.value,ghost:$('#neon-ghost-enabled').checked},neon);
};

$('#practice-open').onclick = () => {
  practiceCar.value = pit.selected;
  drawPracticeNote();
  practice.showModal();
};
$('#practice-cancel').onclick = () => practice.close();
$('#practice-form fieldset').onchange = drawPracticeNote;
practiceRoute.onchange = () => void updatePracticeZones();
$('#practice-form').onsubmit = event => {
  event.preventDefault();
  const kind = $('#practice-form input[name="practice-mode"]:checked').value, lesson = LESSONS[kind];
  const route = lesson?.route ?? practiceRoute.value;
  const zone = lesson ? String(lesson.gate) : practiceZone.value || '0';
  void launch({mode:'practice',route,zone,car:practiceCar.value,lesson:lesson ? kind : undefined},practice);
};

$('#duo-open').onclick = () => {
  duoFirst.value = pit.selected;
  for (const index of [0,1]) {
    const {gas,brake,left,right,handbrake} = pit.keys[index];
    $(`#duo-bindings-${index+1}`).textContent = [gas,brake,left,right].map(keyLabel).join(' ')+' + '+keyLabel(handbrake);
  }
  duo.showModal();
};
$('#duo-cancel').onclick = () => duo.close();
duoMode.onchange = () => {
  $('#duo-contact-row').hidden = duoMode.value!=='free';
  $('#duo-rules').textContent = {
    free:'Катайтесь по трассе сколько хотите. T возвращает обе машины на старт.',
    points:'90 секунд. Побеждает тот, кто наберёт больше очков.',
    tandem:'Два заезда по 45 секунд. Ведомый получает бонус за близость и синхронный занос. После первого заезда поменяйтесь ролями.',
  }[duoMode.value];
};
$('#duo-form').onsubmit = event => {
  event.preventDefault();
  void launch({ mode:'duo', car:duoFirst.value, second:duoSecond.value, competition:duoMode.value,
    route:$('#duo-route').value, contacts:$('#duo-contact').value==='on' },duo);
};
if (/^\d{6}$/.test(new URLSearchParams(location.search).get('room') ?? '')) void launch({mode:'invite'});
