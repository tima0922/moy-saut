import * as THREE from 'three';
import { createWorld } from './world.js';
import { batchSharedMeshes } from './garage-visuals.js';
import { BATTERY, fitE39 } from './bmw.js?v=09';
import { ARENA, PIT_EXIT, PIT_LANE_HALF, PIT_MERGE, createLayout, createRun } from './drift.js?v=09';
import { createDriftWorld } from './drift-world.js?v=09';
import { createDistrict, SHOP, TRACK } from './district.js?v=09';
import { createPhysics, MODELS, STEP } from './vehicle.js?v=09';
import { buildPitCar } from './pit-cars.js?v=09';
import { FLEET, SETUPS, loadPit, savePit, setupFor } from './pit-save.js?v=09';
import { JOBS, advance, loadCareer, saveCareer, makeRoadTest } from './career.js?v=08';

const $ = selector => document.querySelector(selector);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = THREE.MathUtils.damp;
const canvas = $('#scene');
let storage;
try { storage = window.localStorage; } catch { /* The game can run without persistent storage. */ }
const career = loadCareer(storage);
const pit = loadPit(storage, career.driftBest);
const controls = new Set();
const key = (...codes) => codes.some(code => controls.has(code));
const saved = () => saveCareer(storage, career);

function clearControls() {
  controls.clear();
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  await boot();
} catch (error) {
  console.error(error);
  $('#loading').textContent = renderer
    ? 'Не удалось загрузить файлы игры. Обнови страницу и попробуй ещё раз.'
    : 'В этом браузере недоступен WebGL 2. Включи аппаратное ускорение или открой игру в другом браузере.';
}

async function boot() {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const touchScreen = matchMedia('(pointer: coarse)');
  const camera = new THREE.PerspectiveCamera(62, 1, .035, 185);
  camera.rotation.order = 'YXZ';
  const world = createWorld(renderer, { districtMode: true });
  const district = createDistrict(world, renderer);
  const bmw = await fitE39(world);
  bmw.engine = world.engine;
  bmw.root = new THREE.Group();
  for (const object of [...world.car.children]) bmw.root.add(object);
  world.car.add(bmw.root);
  const visuals = { sedan: bmw, touring: bmw };
  let rig = bmw;
  for (const object of [world.scene, world.car, world.engine, world.lift, world.arms]) {
    batchSharedMeshes(object);
  }
  const layout = createLayout();
  const arena = createDriftWorld(world, layout, district.asphalt);
  const barriers = [...district.obstacles, ...arena.obstacles];
  const physics = await createPhysics(barriers, ARENA);
  const { car, scene, door, key: workLight } = world;
  world.arms.position.y = -.17;
  const wheelMark = new THREE.Mesh(new THREE.TorusGeometry(.344, .013, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: .68 }));
  wheelMark.position.x = -.15;
  wheelMark.rotation.y = Math.PI / 2;
  bmw.hubs[0].add(wheelMark);

  const startPose = V(-4.2, 1.68, -3.6);
  const player = startPose.clone();
  const chase = V(0, 0, 0);
  const eye = V(0, 0, 0);
  const direction = V(0, 0, 0);
  const clock = new THREE.Timer();
  clock.connect(document);
  let state = 'menu';
  let model = MODELS.sedan;
  let modelId = 'sedan';
  let damageCooldown = 0;
  let saveElapsed = 0;
  let dirty = false;
  let wasInBay = false;
  let onCircuit = false;
  let seated = false;
  let cockpit = false;
  let lifted = false;
  let gateOpen = false;
  let hoodOpen = false;
  let hoodReleased = false;
  let trunkOpen = false;
  let hatchOpen = false;
  let leaving = false;
  let doorSide = 'left';
  const walkVelocity = V(0, 0, 0);
  let leftDoorTimer = 0;
  let noticeUntil = 0;
  let mouseDown = false;
  let accumulated = 0;
  let fpsTime = 0;
  let fpsFrames = 0;
  let nextPitHud = 0;
  let raceCamera = 0;
  let roadTest;
  let ignitionSeconds = 0;
  let parked = true;
  let cameraCut = true;
  let repairSoundUntil = 0;
  let repairTime = 0;
  let audio;

  let brakeResult;
  let driftRun;
  let lastScore;
  const heading = new THREE.Quaternion();
  const carEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const jobs = $('#job-text');
  const action = $('#action');
  const notice = $('#notice');
  const roadPin = $('#world-pin');
  const hud = $('#play');
  const mapPlayer = $('#map-player');
  const mapTarget = $('#map-target');
  const speedText = $('#speed');
  const engineText = $('#engine');
  const gear = $('#gear');
  const rev = $('#rev');
  const driftHud = $('#drift-hud');
  const driftTime = $('#drift-time');
  const driftScore = $('#drift-score');
  const driftCombo = $('#drift-combo');
  const driftStatus = $('#drift-status');
  const driftSector = $('#drift-sector');
  const driftAngle = $('#drift-angle');
  const driftLaps = $('#drift-laps');
  const driftBest = $('#drift-best');
  const pitPanel = $('#pit-panel');
  const pitOpen = $('#pit-open');
  const mapGate = $('#map-gate');
  const number = new Intl.NumberFormat('ru-RU');
  const path = layout.road.map(p => `${p.x.toFixed(2)} ${(-p.z).toFixed(2)}`).join(' L ');
  $('#map-course').setAttribute('d', 'M ' + path + ' Z');

  const condition = () => pit.cars[modelId];
  const garageMode = () => state === 'pit';
  const canTune = () => garageMode() && insideBay() && physics.totalSpeed < .28 && physics.up > .8 && !lifted;
  function persistPit() {
    savePit(storage, pit);
    dirty = false;
    saveElapsed = 0;
  }

  function finishRun(bank = true) {
    if (!driftRun) return;
    driftRun.finish(bank);
    if (bank) {
      lastScore = driftRun.run.score;
      condition().best = Math.max(condition().best, lastScore);
    }
    persistPit();
    arena.markGate(-1);
  }

  function updatePitHud() {
    const showRun = onCircuit && Boolean(driftRun);
    $('.job').hidden = showRun;
    driftHud.hidden = !showRun;
    $('#location-area').textContent = onCircuit ? 'КОНТУР 67' : insideBay() ? 'БОКС 01' : 'ПИТ-ЛЕЙН';
    $('#location-mode').textContent = showRun && driftRun.run.status !== 'finished' ? 'ЗАЕЗД' : 'ДРИФТ-КЛУБ';
    $('#map-title').textContent = onCircuit ? 'КОНТУР 67' : 'ПИТ-ЛЕЙН';
    $('#map-svg').setAttribute('viewBox', onCircuit ? '-59 -230 118 118' : '-34 -141 68 157');
    updateJob();
  }

  function updateSession(previousZ) {
    const { x, z } = physics.position;
    const inBay = insideBay();
    if (inBay && !wasInBay) {
      driftRun = null;
      arena.markGate(-1);
      persistPit();
    }
    wasInBay = inBay;
    const circuit = z > ARENA.z - ARENA.d / 2 + .6;
    const crossing = seated && Math.abs(x) < PIT_LANE_HALF;
    if (crossing && previousZ < PIT_MERGE && z >= PIT_MERGE && !driftRun) {
      driftRun = createRun(layout, { startImmediately: true });
      arena.fx.reset();
      arena.markGate(0);
      tell('Заезд начался. Налево по трассе к зелёному створу.', 4);
      updatePitHud();
    }
    if (crossing && previousZ >= PIT_EXIT && z < PIT_EXIT && driftRun?.run.status === 'running') finishRun();
    if (circuit !== onCircuit) {
      onCircuit = circuit;
      updatePitHud();
    }
  }

  function updateCondition(handbrake) {
    const wear = condition();
    damageCooldown = Math.max(0, damageCooldown - STEP);
    if ((physics.hit || physics.up < .45) && !damageCooldown) {
      wear.body = Math.max(0, wear.body - Math.min(16, 2.5 + physics.totalSpeed * .55));
      damageCooldown = .65;
      dirty = true;
    }
    if (onCircuit && physics.grounded && physics.totalSpeed > 5) {
      const slip = Math.min(1, Math.abs(physics.slip));
      if (slip > .18 || handbrake) {
        wear.tires = Math.max(0, wear.tires - (slip * .85 + Number(handbrake) * .24) * STEP);
        dirty = true;
      }
      if (physics.braking && !handbrake) {
        wear.brakes = Math.max(0, wear.brakes - .42 * STEP);
        dirty = true;
      }
    }
    if (dirty) {
      physics.setSetup(setupFor(wear));
      saveElapsed += STEP;
      if (saveElapsed > 2) persistPit();
    }
  }

  const job = () => JOBS[career.completed % JOBS.length];
  const phase = () => career.phase;
  const broken = () => state === 'shift' && ['diagnose', 'parts', 'repair'].includes(phase()) ? job().id : '';
  const insideBay = () => Math.abs(physics.position.x) < 1.08 && Math.abs(physics.position.z) < 2.5;
  const carPoint = (x, y, z) => V(x, y, z * model.length).applyQuaternion(physics.rotation).add(physics.position);
  const position = () => seated ? physics.position : player;
  const near = (point, distance) => Math.hypot(position().x - point.x, position().z - point.z) < distance;
  const nearPoint = (x, z, distance) => near({ x, z }, distance);
  const markerPosition = (target, x, z) => target.setAttribute('transform', `translate(${x.toFixed(2)} ${(-z).toFixed(2)})`);

  function tell(text, seconds = 3) {
    notice.textContent = text;
    notice.hidden = false;
    noticeUntil = performance.now() + seconds * 1000;
  }

  function quality() {
    const touch = touchScreen.matches;
    const scale = career.high ? (touch ? 1.25 : 1.75) : (touch ? 1 : 1.25);
    renderer.setPixelRatio(Math.min(scale, window.devicePixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.shadowMap.enabled = career.high;
    $('#graphics').textContent = career.high ? 'Графика: высокая' : 'Графика: стандарт';
    world.dust.visible = career.high;
  }

  function updateJob() {
    const current = job();
    const title = $('#job-title');
    const reading = $('#job-reading');
    reading.hidden = true;
    $('#model').textContent = model.name;
    $('#money').textContent = `${career.money.toLocaleString('ru-RU')} кр.`;
    pitOpen.hidden = !garageMode() || !insideBay();
    if (garageMode()) {
      const wear = condition();
      $('#job-label').textContent = 'КОНТУР 67 / ' + (insideBay() ? 'БОКС 01' : 'ПИТ-ЛЕЙН');
      title.textContent = insideBay() ? 'Твой бокс' : 'Проезд к трассе';
      jobs.textContent = insideBay()
        ? 'G — ворота, R — мотор. Выезжай прямо по жёлтой разметке. P открывает гараж и настройки.'
        : driftRun?.run.status === 'finished'
          ? `Заезд завершён · ${number.format(driftRun.run.score)} очков. Вернись в бокс по жёлтой разметке.`
          : 'Езжай по жёлтой разметке. Таймер запустится у зелёных стоек.';
      reading.hidden = false;
      reading.textContent = `Кузов ${Math.round(wear.body)}% · Шины ${Math.round(wear.tires)}% · Тормоза ${Math.round(wear.brakes)}%`;
      if (insideBay() && lastScore !== undefined) title.textContent = `Заезд · ${number.format(lastScore)} очков`;
      $('#money').textContent = `Рекорд ${number.format(wear.best)}`;
      return;
    }
    $('#job-label').textContent = `ЗАКАЗ ${String(career.completed + 1).padStart(2, '0')} · ${career.scanner ? 'СКАНЕР КУПЛЕН' : 'БОКС 01'}`;
    title.textContent = current.title;
    const tasks = {
      offer: current.complaint + ' Подойди к столу приёмки.',
      diagnose: current.id === 'battery' ? 'Подойди к багажнику, открой его (B) и подними лючок в полу (E) и замерь напряжение.'
        : 'Подойди к переднему левому колесу. Проверь его клавишей E.',
      parts: `Забери в магазине деталь «${current.part}». Точка выдачи отмечена на карте.`,
      repair: current.id === 'battery' ? 'Открой багажник (B) и лючок в полу (E), затем замени аккумулятор.'
        : current.id === 'brakes' ? 'Поставь машину в бокс. У переднего левого колеса замени колодки.'
          : 'Подойди к переднему левому колесу и подкачай его.',
      verify: current.test + (current.id === 'battery' ? '' : ' Едь в сторону дальнего забора.'),
      return: 'Припаркуй машину внутри бокса и подойди к столу приёмки, чтобы закрыть заказ.',
    };
    jobs.textContent = tasks[phase()];
    if (['parts', 'repair', 'verify', 'return'].includes(phase())) {
      reading.hidden = false;
      reading.textContent = ['parts', 'repair'].includes(phase()) ? current.reading
        : brakeResult || 'Ремонт выполнен · нужна проверка';
      if (phase() === 'return' && !brakeResult) reading.textContent = 'Проверка пройдена';
    } else if (phase() === 'diagnose' && career.scanner) {
      reading.hidden = false;
      reading.textContent = 'Сканер · ' + current.reading;
    }
  }

  function updateControls() {
    $('#dash').hidden = !seated;
    $('#crosshair').hidden = seated;
    const hints = seated
      ? [['W', 'газ'], ['S', 'тормоз / назад'], ['A / D', 'руль'], ['Space', 'ручник'], ['R', 'мотор'], ['G', 'ворота'], ['C', 'камера'], ['E', 'выйти'], ['T', 'эвакуатор']]
      : [['WASD', 'ходьба'], ['Мышь', 'осмотр'], ['E', 'действие'], ['H', 'капот'], ['B', 'багажник'], ['G', 'ворота'], ['L', 'подъёмник'], ['T', 'эвакуатор']];
    if (garageMode()) hints.push(['P', 'тюнинг в боксе']);
    $('#keys').innerHTML = hints.map(([button, description]) => `<span><kbd>${button}</kbd> ${description}</span>`).join('');
  }

  function setCar(id) {
    if (!visuals[id]) {
      visuals[id] = buildPitCar(world, id);
      car.add(visuals[id].root);
    }
    rig.root.visible = false;
    rig = visuals[id];
    rig.root.visible = true;
    model = MODELS[id];
    modelId = id;
    physics.setModel(model);
    car.scale.z = model.length;
    for (const paint of rig.paints) paint.color.set(garageMode() ? condition().color : model.color);
    if (garageMode()) physics.setSetup(setupFor(condition()));
    cockpit = false;
    raceCamera = 0;
    damageCooldown = 0;
    hoodOpen = hoodReleased = trunkOpen = hatchOpen = lifted = leaving = false;
    rig.hood.rotation.x = rig.trunk.rotation.x = rig.batteryHatch.rotation.x = 0;
    world.arms.position.y = -.17;
    for (const panel of Object.values(rig.carDoors)) panel.rotation.y = 0;
    leftDoorTimer = 0;
    repairTime = 0;
    brakeResult = null;
    ignitionSeconds = 0;
    roadTest = makeRoadTest(job().id, TRACK);
    parked = true;
    cameraCut = true;
    physics.render(car, rig.wheels, 1, rig.hubs);
  }

  function openPitPanel() {
    if (!canTune()) return tell('Поставь машину в центр бокса и остановись.');
    physics.running = false;
    clearControls();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    renderPitPanel();
    pitPanel.showModal();
  }

  const partLabels = {
    tires: ['Шины', 'Заменить'],
    body: ['Кузов', 'Починить'],
    brakes: ['Тормоза', 'Обслужить'],
  };
  $('#pit-fleet').innerHTML = Object.entries(FLEET).map(([id, details]) => `
    <button type="button" class="pit-car" data-car="${id}">
      <span class="label">${details.code}</span><strong>${MODELS[id].name}</strong>
      <small>${details.engine}</small><small>${details.feel}</small>
    </button>`).join('');
  $('#pit-parts').innerHTML = Object.entries(partLabels).map(([part, [label, action]]) => `
    <div class="pit-row"><span>${label} <small data-condition="${part}"></small></span>
    <button type="button" data-service="${part}">${action}</button></div>`).join('');
  $('#pit-tune').innerHTML = Object.entries(SETUPS).map(([name, option]) => `
    <label class="pit-row">${option.label}<select data-setup="${name}">
    ${option.options.map((text, index) => `<option value="${index}">${text}</option>`).join('')}
    </select></label>`).join('');

  function renderPitPanel() {
    const wear = condition();
    for (const button of $('#pit-fleet').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.car === modelId));
    }
    for (const part of Object.keys(partLabels)) {
      const value = wear[part] === 100 ? 100 : Math.floor(wear[part]);
      $(`[data-condition="${part}"]`).textContent = `${value}%`;
      $(`[data-service="${part}"]`).disabled = wear[part] === 100;
    }
    for (const select of $('#pit-tune').querySelectorAll('select')) select.value = wear[select.dataset.setup];
    $('#pit-color').value = wear.color;
  }

  function applyGarageChanges() {
    physics.setSetup(setupFor(condition()));
    persistPit();
    renderPitPanel();
    updateJob();
  }

  $('#pit-fleet').addEventListener('click', event => {
    const id = event.target.closest('button')?.dataset.car;
    if (!canTune() || !Object.hasOwn(FLEET, id) || id === modelId) return;
    pit.selected = id;
    lastScore = undefined;
    setCar(id);
    if (!seated) {
      player.copy(startPose);
      camera.position.copy(player);
      camera.lookAt(0, 1.1, .4);
    }
    applyGarageChanges();
  });
  $('#pit-parts').addEventListener('click', event => {
    const part = event.target.closest('button')?.dataset.service;
    if (!canTune() || !Object.hasOwn(partLabels, part)) return;
    condition()[part] = 100;
    repairSoundUntil = performance.now() + 600;
    applyGarageChanges();
  });
  $('#pit-tune').addEventListener('change', event => {
    const name = event.target.dataset.setup;
    if (!canTune() || !Object.hasOwn(SETUPS, name)) return;
    condition()[name] = event.target.value === '1' ? 1 : 0;
    applyGarageChanges();
  });
  $('#pit-color').addEventListener('input', event => {
    if (!canTune()) return;
    condition().color = event.target.value;
    for (const paint of rig.paints) paint.color.set(event.target.value);
    persistPit();
  });

  function show(next) {
    if (garageMode()) persistPit();
    clearControls();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    state = next;
    seated = garageMode();
    cockpit = false;
    player.copy(startPose);
    walkVelocity.set(0, 0, 0);
    gateOpen = false;
    door.position.y = 0;
    driftRun = null;
    lastScore = undefined;
    onCircuit = false;
    wasInBay = true;
    arena.markGate(-1);
    arena.fx.reset();
    setCar(garageMode() ? pit.selected : next === 'shift' ? job().car : 'sedan');
    camera.position.copy(player);
    camera.lookAt(0, 1.2, .4);
    $('.job').hidden = false;
    driftHud.hidden = true;
    $('#map-district').style.display = garageMode() ? 'none' : '';
    $('#map-pit').toggleAttribute('hidden', !garageMode());
    $('#map-arena').toggleAttribute('hidden', !garageMode());
    $('#map-legend').hidden = garageMode();
    $('#map-svg').setAttribute('viewBox', '-39 -94 78 114');
    $('#map-title').textContent = 'РАЙОН 01';
    $('#location-area').textContent = 'БОКС 01';
    $('#location-mode').textContent = next === 'shift' ? 'МАСТЕРСКАЯ' : 'ДРИФТ-КЛУБ';
    $('#welcome').hidden = state !== 'menu';
    hud.hidden = state === 'menu';
    $('#menu').hidden = state === 'menu';
    notice.hidden = true;
    if (garageMode()) updatePitHud();
    else updateJob();
    updateControls();
    if (state !== 'menu') resumeAudio();
  }

  function completePhase(expected) {
    if (!advance(career, expected)) return;
    saved();
    updateJob();
  }

  function repairZone() {
    return job().id === 'battery' ? carPoint(BATTERY.x, BATTERY.y, 2.46) : carPoint(-1.15, .5, -1.52);
  }

  const desk = V(-4.7, .08, -4.4);

  function interaction() {
    if (pitPanel.open || repairTime > 0) return null;
    if (!seated && trunkOpen && !hatchOpen && physics.totalSpeed < .55 &&
      near(carPoint(BATTERY.x, BATTERY.y, 2.46), 1.4)) {
      return { label: 'Поднять лючок аккумулятора', run() {
        hatchOpen = true;
        camera.lookAt(carPoint(BATTERY.x, BATTERY.y, BATTERY.z));
        tell('Аккумулятор 12 В · под полом багажника', 1.8);
      } };
    }
    if (seated) return { label: leaving ? 'Отменить выход' : physics.totalSpeed > .12 ? 'Остановиться и выйти' : 'Выйти из машины', run: requestExit };
    if (state === 'shift') {
      if (near(desk, 1.7)) {
        if (phase() === 'offer') return { label: 'Принять заказ', run() {
          completePhase('offer');
          tell('Заказ принят. Начни с диагностики.');
        } };
        if (phase() === 'return') return { label: 'Сдать заказ', run() {
          if (!parked) return tell('Сначала припаркуй машину в боксе.');
          const payment = job().pay;
          completePhase('return');
          setCar(job().car);
          updateJob();
          tell(`Заказ закрыт · +${payment} кр.`);
        } };
        if (career.money >= 450 && !career.scanner) return { label: 'Купить сканер · 450 кр.', run() {
          career.money -= 450;
          career.scanner = true;
          saved();
          updateJob();
          tell('Сканер куплен. Подскажет, что проверять, сразу после приёмки.');
        } };
      }
      if (phase() === 'parts' && near(SHOP, 2.8)) return { label: 'Забрать запчасть', run() {
        completePhase('parts');
        tell('Деталь получена. Вернись к машине.');
      } };
      if (['diagnose', 'repair'].includes(phase()) && near(repairZone(), 1.25) && physics.totalSpeed < .55) {
        const diagnosis = phase() === 'diagnose';
        return { label: diagnosis ? 'Проверить деталь' : job().repair, run() {
          if (job().id === 'battery' && !trunkOpen) return toggleTrunk();
          if (job().id === 'battery' && !hatchOpen) return tell('Подними лючок в полу багажника · E.');
          if (!diagnosis && !insideBay()) return tell('Для ремонта верни машину в бокс.');
          if (!diagnosis && physics.running) return tell('Перед ремонтом заглуши двигатель · R.');
          if (!diagnosis) {
            repairTime = .9;
            repairSoundUntil = performance.now() + 850;
            tell(job().repair + '…', .9);
            return;
          }
          completePhase('diagnose');

          tell(job().reading, 3.6);
        } };
      }
    }
    if (physics.totalSpeed < .6) {
      if (near(carPoint(0, .75, -2.47), 1.35)) return { label: hoodOpen ? 'Закрыть капот' : 'Открыть капот', run: toggleHood };
      if (near(carPoint(0, .75, 2.47), 1.35)) return { label: trunkOpen ? 'Закрыть багажник' : 'Открыть багажник', run: toggleTrunk };
      if (near(carPoint(-1.1, .8, -.36), 1.25)) return { label: 'Сесть за руль', run: enterCar };
    }
    return null;
  }

  function activeTarget() {
    if (garageMode()) {
      if (!seated) return carPoint(-1.43, 0, -.4);
      if (insideBay()) return null;
      if (onCircuit) return driftRun?.run.status === 'finished' ? { x: 0, z: PIT_MERGE } : null;
      return driftRun?.run.status === 'finished' ? { x: 0, z: 0 } : { x: 0, z: PIT_MERGE };
    }
    if (state !== 'shift') return null;
    switch (phase()) {
      case 'offer': return desk;
      case 'diagnose':
      case 'repair': return repairZone();
      case 'parts': return SHOP;
      case 'verify': return job().id === 'battery' ? carPoint(-1.3, 0, -.12) : { x: TRACK.x, z: TRACK.start };
      case 'return': return parked ? desk : { x: 0, z: 0 };
    }
  }

  function enterCar() {
    if (lifted) return tell('Опусти подъёмник · L.');
    leaving = false;
    doorSide = 'left';
    walkVelocity.set(0,0,0);
    seated = true;
    cameraCut = true;
    leftDoorTimer = .62;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    clearControls();
    updateControls();
    tell('R — завести двигатель. G — открыть ворота. E — выйти.');
  }

  const shutter = { x: 0, z: 7.95, w: 5.12, d: .25, h: 4.35 };
  const garageWithShutter = [...barriers, shutter];
  function hitsRectangle(x, z, radius, box) {
    return Math.hypot(Math.max(0,Math.abs(x-box.x)-box.w/2),
      Math.max(0,Math.abs(z-box.z)-box.d/2)) < radius;
  }
  function blocked(x, z, radius = .27) {
    if (barriers.some(box => hitsRectangle(x,z,radius,box))) return true;
    if (door.position.y < 1.79 && hitsRectangle(x,z,radius,shutter)) return true;
    const forward = V(0,0,-1).applyQuaternion(physics.rotation);
    const yaw = Math.atan2(-forward.x,-forward.z);
    const dx = x-physics.position.x, dz = z-physics.position.z;
    const localX = dx*Math.cos(yaw)-dz*Math.sin(yaw);
    const localZ = dx*Math.sin(yaw)+dz*Math.cos(yaw);
    return hitsRectangle(localX,localZ,radius,{x:0,z:0,w:1.98,d:4.76 * model.length});
  }

  function requestExit() {
    if (leaving) {
      leaving = false;
      tell('Выход отменён.', 1.4);
    } else if (physics.totalSpeed <= .12) {
      exitCar();
    } else {
      leaving = true;
      clearControls();
      tell('Останавливаем машину перед выходом.');
    }
  }

  function exitCar() {
    const exits = [-1,1].flatMap(sign => [-.35,-1.03,.26].map(z => ({
      side: sign < 0 ? 'left' : 'right', point: carPoint(sign * 1.57, 0, z),
    })));
    const exit = exits.find(({point}) => !blocked(point.x, point.z, .28));
    leaving = false;
    if (!exit) return tell('Двери заблокированы. Отъедь от стены или вызови эвакуатор · T.');
    seated = false;
    physics.running = false;
    cameraCut = true;
    doorSide = exit.side;
    leftDoorTimer = .82;
    player.set(exit.point.x, 1.68, exit.point.z);
    walkVelocity.set(0,0,0);
    camera.position.copy(player);
    camera.lookAt(carPoint(0, 1.14, -.34));
    clearControls();
    updateControls();
  }

  function toggleGate() {
    if (!nearPoint(0, 7.9, 13)) return tell('Подъедь ближе к гаражу.');
    if (gateOpen && Math.abs(physics.position.z - 7.95) < 2.8 && Math.abs(physics.position.x) < 3.8) {
      return tell('Машина под воротами. Освободи проезд.');
    }
    if (gateOpen && !seated && nearPoint(0, 7.95, 2.55)) return tell('Отойди от ворот.');
    gateOpen = !gateOpen;
    tell(gateOpen ? 'Ворота открываются' : 'Ворота закрываются', 1.3);
  }

  function toggleHood() {
    if (physics.totalSpeed > .5) return tell('Остановись, чтобы открыть капот.');
    if (seated) {
      hoodReleased = true;
      return tell('Замок отпущен. Выйди и подними капот спереди · H.');
    }
    if (!near(carPoint(0, 0, -2.37), 2.65)) return tell('Подойди к переднему бамперу · H.');
    hoodOpen = !hoodOpen;
    hoodReleased = false;
    if (hoodOpen) camera.lookAt(carPoint(0, .77, -1.43));
    tell(hoodOpen ? 'Капот открыт' : 'Капот закрыт', 1.35);
  }

  function toggleTrunk() {
    if (physics.totalSpeed > .5) return tell('Остановись, чтобы открыть багажник.');
    if (!seated && !near(carPoint(0, 0, 2.36), 2.55)) return tell('Подойди к заднему бамперу · B.');
    trunkOpen = !trunkOpen;
    if (!trunkOpen) hatchOpen = false;
    tell(trunkOpen ? 'Багажник открыт' : 'Багажник закрыт', 1.35);
  }

  function toggleLift() {
    if (seated || !nearPoint(-2.7, .5, 4)) return tell('Подойди к стойке подъёмника.');
    if (!insideBay() || physics.totalSpeed > .3 || physics.running) return tell('Припаркуй машину по центру бокса.');
    const forward = V(0, 0, -1).applyQuaternion(physics.rotation);
    if (Math.abs(physics.position.x) > .55 || Math.abs(physics.position.z) > 1.25 || Math.abs(forward.z) < .96) {
      return tell('Выровняй машину по разметке подъёмника.');
    }
    lifted = !lifted;
    physics.setLift(lifted ? 1.02 : 0);
  }

  function toggleIgnition() {
    if (!seated) return tell('Сначала сядь за руль.');
    if (broken() === 'battery') return tell('Стартер щёлкает. Проверь аккумулятор.');
    physics.running = !physics.running;
    resumeAudio();
    tell(physics.running ? 'Двигатель запущен' : 'Двигатель выключен', 1.1);
  }

  function recover() {
    if (physics.totalSpeed > 2 && V(0, 1, 0).applyQuaternion(physics.rotation).y > .5) {
      return tell('Остановись перед вызовом эвакуатора.');
    }
    if (garageMode()) {
      finishRun(false);
      driftRun = null;
      onCircuit = false;
    }
    physics.reset();
    if (garageMode()) updatePitHud();
    hoodOpen = hoodReleased = trunkOpen = hatchOpen = lifted = leaving = false;
    parked = true;
    cameraCut = true;
    roadTest = makeRoadTest(job().id, TRACK);
    if (!seated) {
      player.copy(startPose);
      walkVelocity.set(0,0,0);
      camera.position.copy(player);
      camera.lookAt(0,1.1,0);
    }
    tell('Машина возвращена в бокс.');
  }

  function movePlayer(dt) {
    const x = Number(key('KeyD', 'ArrowRight')) - Number(key('KeyA', 'ArrowLeft'));
    const z = Number(key('KeyS', 'ArrowDown')) - Number(key('KeyW', 'ArrowUp'));
    const speed = (key('ShiftLeft', 'ShiftRight') ? 5.85 : 3.25) / Math.max(1, Math.hypot(x,z));
    const yaw = camera.rotation.y;
    walkVelocity.x = damp(walkVelocity.x,(x*Math.cos(yaw)+z*Math.sin(yaw))*speed,18,dt);
    walkVelocity.z = damp(walkVelocity.z,(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed,18,dt);
    const nextX=player.x+walkVelocity.x*dt;
    const nextZ=player.z+walkVelocity.z*dt;
    if (!blocked(nextX, player.z)) player.x=nextX;
    else walkVelocity.x=0;
    if (!blocked(player.x, nextZ)) player.z=nextZ;
    else walkVelocity.z=0;
  }

  function look(dx, dy) {
    if (state === 'menu' || seated || pitPanel.open) return;
    camera.rotation.y -= dx * .002;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * .002, -1.35, 1.35);
  }

  canvas.addEventListener('mousedown', event => {
    if (event.button !== 0 || state === 'menu' || seated || document.pointerLockElement === canvas) return;
    mouseDown = true;
    try { canvas.requestPointerLock()?.catch(() => {}); } catch { /* Drag to look remains available. */ }
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement === canvas || mouseDown) look(event.movementX, event.movementY);
  });
  document.addEventListener('pointerlockchange', () => { mouseDown = false; clearControls(); });
  window.addEventListener('blur', () => { clearControls(); mouseDown = false; });
  document.addEventListener('visibilitychange', clearControls);

  document.addEventListener('keydown', event => {
    if (state === 'menu' || pitPanel.open || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof Element && event.target.matches('button,a,input')) return;
    if (/^(Key[WASDEBHRGCLTP]|Arrow(Up|Down|Left|Right)|Space)$/.test(event.code)) event.preventDefault();
    controls.add(event.code);
    if (event.repeat || repairTime > 0) return;
    switch (event.code) {
      case 'KeyE': interaction()?.run(); break;
      case 'KeyR': toggleIgnition(); break;
      case 'KeyG': toggleGate(); break;
      case 'KeyH': toggleHood(); break;
      case 'KeyB': toggleTrunk(); break;
      case 'KeyL': toggleLift(); break;
      case 'KeyC':
        if (seated) {
          if (rig === bmw) cockpit = !cockpit;
          else raceCamera = 1 - raceCamera;
          cameraCut = true;
        }
        break;
      case 'KeyP': if (garageMode()) openPitPanel(); break;
      case 'KeyT': recover(); break;
    }
  });
  document.addEventListener('keyup', event => {
    controls.delete(event.code);
    if (['KeyS', 'ArrowDown'].includes(event.code) && !key('KeyS', 'ArrowDown')) physics.releasePedal('brake');
    if (['KeyW', 'ArrowUp'].includes(event.code) && !key('KeyW', 'ArrowUp')) physics.releasePedal('gas');
  });
  action.onclick = () => { action.blur(); interaction()?.run(); };
  $('#start').onclick = () => { $('#start').blur(); show('pit'); };
  $('#shift').onclick = () => { $('#shift').blur(); show('shift'); };
  pitOpen.onclick = () => { pitOpen.blur(); openPitPanel(); };
  pitPanel.addEventListener('close', () => { clearControls(); pitOpen.blur(); });
  window.addEventListener('pagehide', () => { if (dirty) persistPit(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dirty) persistPit();
  });
  $('#menu').onclick = () => { $('#menu').blur(); show('menu'); };
  $('#graphics').onclick = () => { $('#graphics').blur(); career.high = !career.high; quality(); saved(); };
  $('#audio').onclick = () => {
    $('#audio').blur();
    career.muted = !career.muted;
    $('#audio').textContent = career.muted ? 'Звук: выкл' : 'Звук: вкл';
    if (!career.muted) resumeAudio();
    saved();
  };
  window.addEventListener('resize', quality);

  function resumeAudio() {
    if (career.muted) return;
    try {
      if (!audio) {
        const context = new AudioContext();
        const engine = context.createOscillator();
        const second = context.createOscillator();
        const filter = context.createBiquadFilter();
        const volume = context.createGain();
        volume.gain.value = 0;
        filter.type = 'lowpass';
        engine.type = 'sawtooth';
        second.type = 'triangle';
        engine.connect(filter);
        second.connect(filter);
        filter.connect(volume).connect(context.destination);
        engine.start();
        second.start();
        const noise = context.createBufferSource();
        const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const tireFilter = context.createBiquadFilter();
        tireFilter.type = 'bandpass';
        tireFilter.frequency.value = 1090;
        tireFilter.Q.value = .72;
        const tireVolume = context.createGain();
        tireVolume.gain.value = 0;
        noise.buffer = buffer;
        noise.loop = true;
        noise.connect(tireFilter).connect(tireVolume).connect(context.destination);
        noise.start();
        audio = { context, engine, second, filter, volume, tireVolume };
      }
      audio.context.resume().catch(() => {});
    } catch { /* The game also plays without an audio device. */ }
  }

  function sound(now) {
    if (!audio) return;
    const { context, engine, second, filter, volume, tireVolume } = audio;
    const time = context.currentTime;
    const motor = physics.rpm / (modelId === 'cls' ? 17 : modelId === 'f90' ? 14 : 15);
    const movingGate = Math.abs(door.position.y - (gateOpen ? 4.5 : 0)) > .08;
    const tool = now < repairSoundUntil;
    engine.frequency.setTargetAtTime(tool ? 95 : movingGate && !physics.running ? 43 : Math.max(22, motor), time, .055);
    second.frequency.setTargetAtTime(Math.max(22, motor * .5), time, .06);
    filter.frequency.setTargetAtTime(cockpit ? 290 : 470 + motor * 3, time, .1);
    const loudness = physics.running ? (seated ? .045 : .031 / (1 + player.distanceTo(car.position) * .15))
      : tool ? .026 : movingGate ? .02 : 0;
    volume.gain.setTargetAtTime(career.muted || state === 'menu' ? 0 : loudness, time, .08);
    const skidding = !career.muted && onCircuit && physics.grounded && physics.totalSpeed > 4;
    const skid = skidding ? Math.min(.16, Math.abs(physics.slip) * .21 + (key('Space') ? .045 : 0)) : 0;
    tireVolume.gain.setTargetAtTime(skid, time, .075);
  }

  function assessDrive() {
    if (state !== 'shift' || phase() !== 'verify' || !seated) return;
    const current = job();
    if (current.id === 'battery') {
      ignitionSeconds = physics.running ? ignitionSeconds + STEP : 0;
      if (ignitionSeconds >= 2) {
        brakeResult = 'Запуск стабилен · 14,2 В при работающем моторе';
        completePhase('verify');
        tell('Двигатель запустился. Заглуши его и сдай заказ.');
      }
      return;
    }
    const heading = V(0, 0, -1).applyQuaternion(physics.rotation).z;
    const result = roadTest({
      x: physics.position.x, z: physics.position.z, heading, speed: physics.speed * 3.6,
      totalSpeed: physics.totalSpeed, service: key('KeyS', 'ArrowDown'),
    });
    if (!result) return;
    const distance = result.value.toFixed(1).replace('.', ',');
    brakeResult = current.id === 'brakes' ? `Тормозной путь · ${distance} м` : `Увод на 18 м · ${distance} м`;
    if (result.pass) {
      completePhase('verify');
      tell(brakeResult + ' · тест пройден!');
    } else {
      tell(brakeResult + ' · попробуй ещё раз.', 3.6);
    }
  }

  function step() {
    if (pitPanel.open) return;
    const previousZ = physics.position.z;
    const { hood, trunk, batteryHatch, bayLight, cargoLight, carDoors, engine } = rig;
    if (repairTime > 0) {
      repairTime = Math.max(0, repairTime - STEP);
      if (repairTime === 0) {
        completePhase('repair');
        tell('Готово. Проверь результат.', 3.6);
      }
    }
    door.position.y = damp(door.position.y, gateOpen ? 4.5 : 0, 4.5, STEP);
    for (const slat of door.children) slat.visible = slat.position.y + door.position.y < 4.35;
    hood.rotation.x = damp(hood.rotation.x, hoodOpen ? 1.16 : hoodReleased ? .04 : 0, 8, STEP);
    trunk.rotation.x = damp(trunk.rotation.x, trunkOpen ? -1.18 : 0, 8, STEP);
    batteryHatch.rotation.x = damp(batteryHatch.rotation.x, hatchOpen ? -1.29 : 0, 10, STEP);
    bayLight.visible = engine.visible = hood.rotation.x > .11;
    cargoLight.visible = trunk.rotation.x < -.14;
    leftDoorTimer = Math.max(0, leftDoorTimer - STEP);
    for (const [side, door] of Object.entries(carDoors)) {
      door.rotation.y = damp(door.rotation.y, leftDoorTimer && side === doorSide ? (side === 'left' ? -.95 : .95) : 0, 10, STEP);
    }
    world.arms.position.y = damp(world.arms.position.y, lifted ? .86 : -.17, 6, STEP);
    const unsecured = hoodOpen || hoodReleased || trunkOpen || hood.rotation.x > .055 || trunk.rotation.x < -.055;
    if (seated && unsecured && key('KeyW','ArrowUp','KeyS','ArrowDown') && !leaving && noticeUntil < performance.now()) {
      tell('Перед выездом закрой капот и багажник.');
    }
    const handbrake = seated && key('Space');
    const drifting = garageMode() && onCircuit;
    physics.tick({
      gas: seated && !unsecured && key('KeyW', 'ArrowUp'),
      reverse: seated && !unsecured && key('KeyS', 'ArrowDown'),
      turn: seated ? Number(key('KeyD', 'ArrowRight')) - Number(key('KeyA', 'ArrowLeft')) : 0,
      handbrake, drift: drifting,
      occupied: seated, parking: leaving || unsecured, fault: broken(), gateY: door.position.y,
      speedLimit: garageMode() && (!driftRun || !onCircuit) && physics.position.z < PIT_MERGE ? 43 : undefined,
    });
    if (garageMode()) {
      updateSession(previousZ);
      updateCondition(handbrake);
      if (onCircuit) arena.fx.tick(STEP, physics, career.high, handbrake);
      if (onCircuit && driftRun && driftRun.run.status !== 'finished') {
        driftRun.tick(STEP, {
          position: physics.position, speed: physics.totalSpeed, slip: physics.slip,
          grounded: physics.grounded, hit: physics.hit, up: physics.up,
        });
        if (driftRun.run.status === 'finished') finishRun();
        else arena.markGate(driftRun.run.next);
      }
    }
    if (leaving && physics.totalSpeed <= .12) exitCar();
    parked = insideBay() && physics.totalSpeed < .55;
    assessDrive();
    if (!seated && repairTime === 0) movePlayer(STEP);
  }

  // Shorten the chase offset when the camera would cross a wall.
  function safeChase(lookAt, desired) {
    let fraction = 1;
    const delta = desired.clone().sub(lookAt);
    const cameraBarriers = door.position.y < 3.6 ? garageWithShutter : barriers;
    for (const box of cameraBarriers) {
      let entry = 0;
      let exit = fraction;
      const ranges = [
        [lookAt.x, delta.x, box.x - box.w / 2 - .14, box.x + box.w / 2 + .14],
        [lookAt.y, delta.y, -.12, box.h + .14],
        [lookAt.z, delta.z, box.z - box.d / 2 - .14, box.z + box.d / 2 + .14],
      ];
      for (const [origin, axis, min, max] of ranges) {
        if (Math.abs(axis) < .0001) {
          if (origin < min || origin > max) exit = -1;
          continue;
        }
        const a = (min - origin) / axis;
        const b = (max - origin) / axis;
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
      if (entry > .02 && entry <= exit) fraction = Math.max(.08, entry - .025);
    }
    return desired.copy(lookAt).addScaledVector(delta, fraction);
  }

  function view(dt, now) {
    if (state === 'menu') {
      const t = now / 7000;
      camera.position.set(-4.6 + Math.sin(t) * .19, 1.78, -4.8 + Math.cos(t) * .18);
      camera.lookAt(.25, .97, .3);
      return;
    }
    if (!seated) {
      camera.position.copy(player);
      return;
    }
    const transform = (v) => v.applyMatrix4(car.matrixWorld);
    if (cockpit) {
      transform(eye.set(-.384, 1.18, .045));
      camera.position.copy(eye);
      camera.quaternion.copy(car.quaternion);
    } else {
      let desired, focus;
      if (onCircuit) {
        const yaw = carEuler.setFromQuaternion(car.quaternion).y;
        const offset = THREE.MathUtils.clamp(physics.slip * .52, -.44, .44);
        heading.setFromAxisAngle(direction.set(0, 1, 0), yaw - offset);
        desired = eye.set(0, raceCamera ? 1.7 : 3.20, (raceCamera ? 4.4 : 6.8) + Math.min(physics.totalSpeed * .045, 1.5))
          .applyQuaternion(heading).add(car.position);
        focus = direction.set(0, 1.05, -2.6).applyQuaternion(heading).add(car.position);
      } else {
        desired = transform(eye.set(.05, raceCamera ? 1.60 : 2.63, (raceCamera ? 4.1 : 5.6) + Math.min(physics.totalSpeed * .035, .9)));
        focus = transform(direction.set(0, 1.05, -.45));
      }
      safeChase(focus, desired);
      if (cameraCut || camera.position.distanceTo(desired) > 9) chase.copy(desired);
      else chase.lerp(desired, 1 - Math.exp(-dt * 8.5));
      camera.position.copy(safeChase(focus, chase.clone()));
      camera.lookAt(focus);
    }
    cameraCut = false;
  }

  function renderHud(now) {
    const onFoot = !seated;
    const prompt = interaction();
    action.hidden = !prompt || seated && onCircuit && physics.totalSpeed > 1;
    if (prompt) action.lastElementChild.textContent = prompt.label;
    if (noticeUntil < now) notice.hidden = true;
    if (!onFoot) {
      speedText.textContent = Math.round(physics.totalSpeed * 3.6);
      gear.textContent = physics.speed < -.45 ? 'R' : physics.running ? String(physics.gear) : 'P';
      engineText.textContent = physics.running ? `${Math.round(physics.rpm / 100) * 100} ОБ/МИН` : 'МОТОР ВЫКЛ · R';
      rev.style.width = Math.min(100, physics.rpm * 100 / (model.redline ?? 7000)) + '%';
    }
    const p = position();
    const yaw = onFoot ? camera.rotation.y : carEuler.setFromQuaternion(car.quaternion).y;
    mapPlayer.setAttribute('transform', `translate(${p.x.toFixed(2)} ${(-p.z).toFixed(2)}) rotate(${180 + THREE.MathUtils.radToDeg(yaw)})`);
    if (garageMode()) {
      pitOpen.hidden = !insideBay();
      if (onCircuit && driftRun) renderDrift();
      else if (now >= nextPitHud) {
        updatePitHud();
        nextPitHud = now + 250;
      }
    }
    const target = activeTarget();
    mapTarget.style.display = target ? '' : 'none';
    district.marker.visible = Boolean(target);
    roadPin.hidden = true;
    wheelMark.visible = state === 'shift' && ['diagnose', 'repair'].includes(phase()) && job().id !== 'battery' && onFoot;
    if (target) {
      markerPosition(mapTarget, target.x, target.z);
      district.marker.position.set(target.x, .023, target.z);
      district.marker.scale.setScalar(1 + .1 * Math.sin(now / 240));
      const point = V(target.x, (target.y ?? 0) + .58, target.z).project(camera);
      if (point.z < 1 && point.z > -1 && Math.abs(point.x) < .94 && Math.abs(point.y) < .9) {
        roadPin.hidden = false;
        roadPin.style.left = (point.x * .5 + .5) * 100 + '%';
        roadPin.style.top = (-point.y * .5 + .5) * 100 + '%';
      }
    }
  }

  function renderDrift() {
    const { run } = driftRun;
    const seconds = Math.ceil(run.time);
    driftTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    driftScore.textContent = number.format(run.score);
    driftCombo.textContent = run.chain >= 1 ? `+${Math.floor(run.chain)} · ×${run.multiplier}` : '';
    driftStatus.textContent = run.status === 'finished' ? 'Заезд завершён. Вернись в бокс по жёлтой разметке для следующей попытки.' : run.warning ? `${run.warning} · серия сброшена`
        : run.sliding ? 'Занос · держи угол и тягу' : 'На дуге коротко нажми пробел и поймай машину контррулём. Следуй к зелёному створу.';
    driftSector.textContent = `Створ ${run.next + 1} / ${layout.gates.length}`;
    driftAngle.textContent = `Угол ${Math.round(run.angle)}°`;
    driftLaps.textContent = `Круги ${run.lap}`;
    driftBest.textContent = `Рекорд ${number.format(condition().best)}`;
    mapGate.style.display = run.status === 'finished' ? 'none' : '';
    const gate = layout.gates[run.next].position;
    markerPosition(mapGate, gate.x, gate.z);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    clock.update(now);
    const elapsed = clock.getDelta();
    const dt = Math.min(elapsed, .1);
    if (document.hidden) return;
    accumulated += dt;
    while (accumulated >= STEP) {
      step();
      accumulated -= STEP;
    }
    physics.render(car, rig.wheels, accumulated / STEP, rig.hubs);
    car.updateMatrixWorld(true);
    world.contact.position.set(car.position.x, .023, car.position.z);
    world.contact.visible = !lifted;
    for (const lamp of rig.lampMeshes) lamp.visible = physics.braking;
    rig.brakeLamps.emissiveIntensity = physics.braking ? 1.2 : rig === bmw ? 0 : .22;
    if (rig.steering) rig.steering.rotation.z = -rig.hubs[0].rotation.y * 4;
    const inWorkshop = position().z < 8.4 && position().z > -8.3 && Math.abs(position().x) < 7.3;
    workLight.castShadow = inWorkshop;
    district.sunlight.castShadow = !inWorkshop;
    district.sunlight.intensity = damp(district.sunlight.intensity, inWorkshop ? .55 : onCircuit ? 2.6 : 2.05, 6, dt);
    const lightZ = Math.max(23, position().z);
    district.sunlight.position.z = lightZ + 13;
    district.sunlight.target.position.z = lightZ;
    view(dt, now);
    camera.updateMatrixWorld();
    district.sky.position.copy(camera.position);
    sound(now);
    renderer.render(scene, camera);
    fpsTime += elapsed;
    fpsFrames++;
    if (fpsTime >= .9) {
      $('#fps').textContent = Math.round(fpsFrames / fpsTime) + ' FPS';
      fpsTime = fpsFrames = 0;
    }
    if (state !== 'menu') renderHud(now);
  }

  quality();
  $('#audio').textContent = career.muted ? 'Звук: выкл' : 'Звук: вкл';
  show('menu');
  await world.assetsReady;
  arena.group.visible = true;
  $('#loading').textContent = '';
  $('#start').disabled = $('#shift').disabled = false;
  Object.defineProperty(window, 'garageLife', { value: Object.freeze({
    getState: () => ({
      mode: state, seated, cockpit, running: physics.running, speed: physics.speed * 3.6,
      car: physics.position.toArray(), player: player.toArray(), yaw: camera.rotation.y, gate: door.position.y, lifted,
      hood: hoodOpen, trunk: trunkOpen, batteryHatch: hatchOpen, drift: driftRun ? { ...driftRun.run } : null, leaving, phase: phase(), job: job().id, money: career.money, completed: career.completed,
      model: modelId, onCircuit, setup: garageMode() ? { ...condition() } : null,
      assets: { ...world.assetStatus }, render: { ...renderer.info.render }, graphics: career.high ? 'high' : 'standard',
    }),
  }) });
  requestAnimationFrame(frame);
}
