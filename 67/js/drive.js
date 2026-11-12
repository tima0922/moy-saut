import * as THREE from 'three';
import { createWorld } from './world.js';
import { batchSharedMeshes } from './garage-visuals.js';
import { BATTERY, fitE39 } from './bmw.js?v=013';
import { CLUB_ARENA, createClubLayout, createShortLayout, createRun, safeCircuitStart } from './drift.js?v=015';
import { createDriftWorld, createTireEffects } from './drift-world.js?v=017';
import { createDistrict, SHOP, TRACK } from './district.js?v=013';
import { createPhysics, MODELS, STEP } from './vehicle.js?v=017';
import { loadPitCar } from './pit-cars.js?v=017';
import { FLEET, SETUPS, DRIFT_SETUP, loadPit, savePit, setupFor } from './pit-save.js?v=017';
import { CLUB_FLOOR, STALLS, STALL_Z, SERVICE_STEPS, createClubGarage } from './club-garage.js?v=017';
import { circuitTerrain } from './circuit-terrain.js?v=017';
import { PRACTICE_PAD, TANDEM_HEAT, practiceStart, createPracticePad, createTandem } from './drift-modes.js?v=015';
import { createDriftAudio } from './drift-audio.js?v=017';
import { createReplayPlayer, createReplayRecorder } from './drift-replay.js';
import { createGuest, raceTelemetry } from './local-duo.js?v=015';
import { DEFAULT_KEYS, DRIVING_ACTIONS, allowedKey, keyLabel, loadBindings } from './drive-bindings.js';
import { createOrbitCamera } from './orbit-camera.js?v=013';
import { JOBS, advance, loadCareer, saveCareer, makeRoadTest } from './career.js?v=08';

const $ = selector => document.querySelector(selector);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = THREE.MathUtils.damp;
const GRAPHICS = {
  auto: { shadows:true,shadowMs:1000/30,dpr:1.25,scale:1 },
  ultra: { shadows:true,shadowMs:1000/60,dpr:1.5,scale:1 },
  performance: { shadows:false,dpr:1,scale:.85 },
};
const touchScreen = matchMedia('(pointer: coarse)');
const touchDrive = new Set();
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
  touchDrive.clear();
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchScreen.matches, powerPreference: 'high-performance' });
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
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  const camera = new THREE.PerspectiveCamera(62, 1, .035, 185);
  camera.rotation.order = 'YXZ';
  const world = createWorld(renderer, { districtMode: true });
  const district = createDistrict(world, renderer);
  const bmw = await fitE39(world);
  bmw.engine = world.engine;
  bmw.root = new THREE.Group();
  for (const object of [...world.car.children]) bmw.root.add(object);
  world.car.add(bmw.root);
  const [f90, cls, supra] = await Promise.all(['f90','cls','supra'].map(id => loadPitCar(world,id)));
  const visuals = { sedan: bmw, touring: bmw, f90, cls, supra };
  let rig = bmw;
  for (const object of [world.scene, world.car, world.engine, world.lift, world.arms]) {
    batchSharedMeshes(object);
  }
  const mainLayout = createClubLayout();
  const shortLayout = createShortLayout(mainLayout);
  const routeFor = value => value === 'short' ? shortLayout : mainLayout;
  let layout = mainLayout;
  const terrain = circuitTerrain(mainLayout,shortLayout.connector);
  const arena = createDriftWorld(world, mainLayout, district.asphalt, terrain,shortLayout);
  const club = createClubGarage(world);
  const practice = createPracticePad(world,district.asphalt);
  const padEffects = createTireEffects(practice.root);
  const barriers = [...district.obstacles, ...arena.obstacles, ...club.obstacles, ...practice.obstacles];
  const physics = await createPhysics(barriers,CLUB_ARENA,CLUB_FLOOR,terrain,PRACTICE_PAD);
  const { car, scene, door, key: workLight } = world;
  const guestContact = world.contact.clone();
  guestContact.visible = false;
  scene.add(guestContact);
  const groundNormal = V(0,1,0), planeNormal = V(0,0,1);
  const legacyScenery = new THREE.Group();
  scene.add(legacyScenery);
  const orbit = createOrbitCamera();
  const brakeDisc = new THREE.Group();
  world.cylinder(brakeDisc,.235,.235,.039,[0,0,0],world.mats.steel,[0,0,Math.PI/2],30);
  world.cylinder(brakeDisc,.078,.078,.075,[-.028,0,0],world.mats.metal,[0,0,Math.PI/2]);
  world.box(brakeDisc,[.082,.19,.092],[-.049,.035,-.193],world.mats.red);
  brakeDisc.visible = false;
  const detachedWheel = new THREE.Group();
  club.room.add(detachedWheel);
  const walkStart = V(0, 1.68, -47.7);
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
  let onCircuit = false;
  let guest;
  let guestModelId;
  let duoFree = false;
  let training;
  let tandem;
  let recorder;
  let guestRecorder;
  let previousBest;
  let replay;
  let replayTarget;
  let eventCursor;
  let renderScale = 1;
  let headroom = 0;
  let shadowDirty = true;
  let shadowDue = 0;
  const shadowPose = { position:V(0,0,0), rotation:new THREE.Quaternion() };
  const guestShadowPose = { position:V(0,0,0), rotation:new THREE.Quaternion() };
  let nextHud = 0;
  let graphicsMode = Object.hasOwn(GRAPHICS,career.graphics) ? career.graphics : career.high === false ? 'performance' : 'auto';
  const selectProfile = () => touchScreen.matches && graphicsMode === 'auto'
    ? { shadows: false, dpr: 1, scale: 1 }
    : GRAPHICS[graphicsMode];
  let profile = selectProfile();
  let guestEffects;
  let guestTap = false;
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
  let orbitHeld = false;
  let orbitState = { yaw: 0, pitch: 0 };
  let manual;
  let removedWheel;
  let tappedHandbrake = false;
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
  const raceStart = $('#race-start');
  const raceReturn = $('#race-return');
  const raceRetry = $('#race-retry');
  const raceStartBanner = $('#race-start-banner');
  const number = new Intl.NumberFormat('ru-RU');
  const duoSetup = $('#duo-setup');
  const practiceSetup = $('#practice-setup');
  const soloRoute = $('#solo-route');
  const bindingsPanel = $('#bindings-panel');
  const bindingsGrid = $('#bindings-grid');
  const bindingsStatus = $('#bindings-status');
  let bindingTarget;
  function driverCodes(index,action) {
    const code = pit.keys[index][action];
    const soloAlias = DEFAULT_KEYS[1][action];
    if (!index && !guest && code === DEFAULT_KEYS[0][action] && soloAlias.startsWith('Arrow') && !Object.values(pit.keys[0]).includes(soloAlias)) {
      return [code,soloAlias];
    }
    if (index && action === 'handbrake' && code === 'ShiftRight' && !pit.keys.some(keys => Object.values(keys).includes('Numpad0'))) {
      return [code,'Numpad0'];
    }
    return [code];
  }
  const drivingKey = (index, action) => (!index && touchDrive.has(action)) || key(...driverCodes(index, action));
  const walkKey = (action, ...codes) => touchDrive.has(action) || key(...codes);
  function keyboardSummary(index) {
    const keys = pit.keys[index];
    return ['gas','brake','left','right'].map(action => keyLabel(keys[action])).join(' ') + ' + ' + keyLabel(keys.handbrake);
  }
  function renderBindings() {
    bindingsGrid.innerHTML = pit.keys.map((keys,index) => `<section><h3>Игрок ${index+1}</h3>${Object.entries(DRIVING_ACTIONS).map(([action,label]) =>
      `<div class="pit-row"><span>${label}</span><button type="button" data-player="${index}" data-action="${action}" aria-label="Игрок ${index+1}, ${label}">${keyLabel(keys[action])}</button></div>`).join('')}</section>`).join('');
    for (const index of [0,1]) $(`#duo-bindings-${index+1}`).textContent = keyboardSummary(index);
    $('#race-start-banner kbd').textContent = keyLabel(pit.keys[0].gas);
  }
  renderBindings();
  const raceEvents = $('#drift-events');
  const replayButton = $('#drift-replay');
  const duoReplayButton = $('#duo-replay');
  const finishButton = $('#drift-finish');
  const replayBanner = $('#replay-banner');
  const assistLevel = $('#assist-level');
  assistLevel.value = pit.assist;
  physics.setAssist(pit.assist);
  const padActive = () => training === 'pad' && onCircuit;
  const practiceRoute = $('#practice-route');
  const practiceZone = $('#practice-zone');
  function updatePracticeZones() {
    practiceZone.innerHTML = '<option value="pad">Площадка для восьмёрок</option>' +
      routeFor(practiceRoute.value).gates.map((_,i) => `<option value="${i}">Перед створом ${i+1}</option>`).join('');
    if (practiceRoute.value === 'short') practiceZone.value = '0';
  }
  practiceRoute.onchange = updatePracticeZones;
  updatePracticeZones();
  const duoHud = $('#duo-race');
  const duoDrivers = [1,2].map(index => ({
    label: $(`#duo-label-${index}`), score: $(`#duo-score-${index}`), info: $(`#duo-info-${index}`),
  }));
  const duoTime = $('#duo-time');
  const duoResult = $('#duo-result');
  const duoOptions = Object.keys(FLEET).map(id => `<option value="${id}">${MODELS[id].name}</option>`).join('');
  $('#duo-car-1').innerHTML = $('#duo-car-2').innerHTML = duoOptions;
  $('#practice-car').innerHTML = duoOptions;
  $('#duo-car-1').value = pit.selected;
  $('#duo-car-2').value = 'cls';
  const mapPaths = new Map([mainLayout,shortLayout].map(route =>
    [route,'M ' + route.road.map(p => `${p.x.toFixed(2)} ${(-p.z).toFixed(2)}`).join(' L ') + ' Z']));

  const condition = () => pit.cars[modelId];
  const garageMode = () => state === 'pit';
  const canTune = () => garageMode() && !manual && insideBay() && physics.totalSpeed < .28 && physics.up > .8 && !lifted;
  function persistPit() {
    savePit(storage, pit);
    dirty = false;
    saveElapsed = 0;
  }

  function finishRun(bank = true) {
    if (!driftRun) return;
    driftRun.finish(bank);
    recorder?.tick(0,physics,driftRun.run);
    if (bank && !guest && !training) {
      lastScore = driftRun.run.score;
      const key = layout.short ? 'shortBest' : 'best';
      condition()[key] = Math.max(condition()[key], lastScore);
    }
    persistPit();
    arena.markGate(-1);
  }

  function syncScene() {
    const workshop = state === 'pit' && !onCircuit || state === 'menu';
    club.room.visible = workshop;
    legacyScenery.visible = state === 'shift';
    arena.group.visible = onCircuit && !padActive();
    practice.root.visible = padActive();
    $('.map').hidden = padActive();
    scene.fog.color.setHex(onCircuit ? 0xc8a991 : 0xa2b6c4);
    const shadow = district.sunlight.shadow.camera;
    const span = guest ? 100 : 53;
    Object.assign(shadow,{left:-span,right:span,top:span,bottom:-span,far:guest ? 220 : 132});
    shadow.updateProjectionMatrix();
    $('#map-district').style.display = state === 'shift' ? '' : 'none';
    $('#map-pit').toggleAttribute('hidden', !workshop);
    $('#map-arena').toggleAttribute('hidden', !onCircuit);
    $('#map-legend').hidden = state !== 'shift';
    $('#map-svg').setAttribute('viewBox', onCircuit ? '-91 -256 182 152'
      : workshop ? '-15 45 30 22' : '-39 -94 78 114');
    $('#map-title').textContent = onCircuit ? 'КОНТУР 67' : workshop ? 'ГАРАЖ' : 'РАЙОН 01';
    $('#location-area').textContent = padActive() ? 'ВОСЬМЁРКИ' : onCircuit ? (layout.short ? 'КОРОТКАЯ ПЕТЛЯ' : 'КОНТУР 67') : workshop ? 'ГАРАЖ' : 'БОКС 01';
    $('#map-course').setAttribute('d', mapPaths.get(layout));
    $('#race-start-banner .label').textContent = `${$('#location-area').textContent} / СТАРТ`;
    $('#location-mode').textContent = onCircuit ? (training ? 'ТРЕНИРОВКА' : duoFree ? 'СВОБОДНЫЙ ЗАЕЗД' : tandem ? 'ТАНДЕМ' : 'ДРИФТ') : workshop ? 'ДРИФТ-КЛУБ' : 'МАСТЕРСКАЯ';
    $('.job').hidden = onCircuit;
    driftHud.hidden = !onCircuit || !!guest;
    raceStartBanner.hidden = !onCircuit || !!guest;
    duoHud.hidden = !guest;
    $('#duo-retry').textContent = duoFree ? 'На старт · T' : 'Повтор · T';
    hud.classList.toggle('is-duo',!!guest);
    quality();
  }

  function resetCamera() {
    cameraCut = true;
    shadowDirty = true;
    orbitHeld = false;
    orbit.reset(carEuler.setFromQuaternion(physics.rotation).y);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function startRace(nextHeat = false) {
    if (!garageMode() || !seated || manual || lifted) return;
    if (hoodOpen || trunkOpen || hoodReleased) return tell('Закрой капот и багажник перед стартом.');
    if (!guest && !training && !onCircuit && condition().battery <= 8) return tell('Аккумулятор разряжен. Обслужи его в гараже · P.');
    clearControls();
    tappedHandbrake = guestTap = false;
    if (onCircuit && driftRun?.run.status === 'running') finishRun(false);
    if (!onCircuit && !guest && !training) {
      layout = routeFor(soloRoute.value);
      condition().battery = Math.max(0, condition().battery - .8);
      persistPit();
    }
    closeReplay();
    if (tandem && !nextHeat) tandem = createTandem();
    onCircuit = true;
    const { x,z,yaw,gate } = training ? practiceStart(layout,training) : layout.spawn;
    const options = {
      duration: tandem ? TANDEM_HEAT : undefined, free: !!training || duoFree,
      pad: padActive() ? PRACTICE_PAD : null, startGate: gate ?? 0,
    };
    driftRun = createRun(layout,options);
    if (!nextHeat) previousBest = undefined;
    recorder = duoFree ? undefined : createReplayRecorder();
    guestRecorder = guest && !duoFree ? createReplayRecorder() : undefined;
    eventCursor = 0;
    raceEvents.replaceChildren();
    const dx=Math.cos(yaw)*2.25, dz=-Math.sin(yaw)*2.25;
    if (tandem) {
      const fx=-Math.sin(yaw), fz=-Math.cos(yaw);
      const first = tandem.leader===0 ? 2.7 : -3.4;
      const second = tandem.leader===1 ? 2.7 : -3.4;
      guest.reset(x+fx*second+dx*.22,z+fz*second+dz*.22,yaw,options);
      physics.reset(x+fx*first-dx*.22,z+fz*first-dz*.22,yaw);
    } else {
      if (guest) guest.reset(x+dx,z+dz,yaw,options);
      physics.reset(guest ? x-dx : x,guest ? z-dz : z,yaw);
    }
    physics.running = true;
    physics.render(car, rig.wheels, 1, rig.hubs);
    cockpit = false;
    arena.fx.reset();
    padEffects.reset();
    arena.markGate(duoFree ? -1 : (gate ?? 0),-1,layout);
    syncScene();
    updateControls();
    resetCamera();
    resumeAudio();
    notice.hidden = true;
  }

  function returnToClub() {
    if (!garageMode() || !onCircuit) return;
    if (guest || training) {
      show('pit');
      return;
    }
    finishRun();
    onCircuit = false;
    driftRun = null;
    seated = cockpit = false;
    leftDoorTimer = 0;
    clearControls();
    physics.reset(STALLS[modelId], STALL_Z);
    physics.render(car, rig.wheels, 1, rig.hubs);
    player.copy(walkStart);
    walkVelocity.set(0, 0, 0);
    camera.position.copy(player);
    camera.lookAt(STALLS[modelId], 1.05, STALL_Z);
    resetCamera();
    syncScene();
    updateControls();
    updateJob();
    tell('Машина в боксе. P — тюнинг и обслуживание.');
  }

  function stopDuo() {
    if (!guest) return;
    guest.remove();
    guest = undefined;
    guestModelId = undefined;
    duoFree = false;
    physics.setCarContacts(true);
    renderScale = 1;
  }

  function startDuo(first,second,mode,route,contacts) {
    if (!Object.hasOwn(FLEET,first) || !Object.hasOwn(FLEET,second)) return;
    show('pit');
    layout = route;
    setCar(first);
    guestEffects ??= arena.makeGuestEffects();
    guest = createGuest({
      scene, rig: visuals[second], world: physics, spec: MODELS[second],
      setup: setupFor(pit.cars[second]), layout, effects: guestEffects,
      color: second === 'supra' ? (first === second ? 0x287aab : pit.cars.supra.color) : 0xc86135,
    });
    guestModelId = second;
    guest.physics.setAssist(pit.assist);
    duoFree = mode === 'free';
    physics.setCarContacts(!duoFree || contacts);
    tandem = mode === 'tandem' ? createTandem() : null;
    seated = true;
    startRace();
  }

  function recoverDriver(isGuest) {
    if (!guest || driftRun.run.status === 'finished') return;
    const driver = isGuest ? guest.physics : physics;
    const other = isGuest ? physics : guest.physics;
    const {x,z,yaw} = safeCircuitStart(layout,driver.position,other.position);
    tandem?.interrupt();
    shadowDirty = true;
    if (isGuest) {
      guestTap = false;
      guest.race.recover();
      guest.place(x,z,yaw);
    } else {
      tappedHandbrake = false;
      driftRun.recover();
      physics.reset(x,z,yaw);
      physics.running = true;
      physics.render(car,rig.wheels,1,rig.hubs);
      resetCamera();
    }
  }

  function bestReplay() {
    const main = { car,wheels:rig.wheels,hubs:rig.hubs };
    const options = [
      previousBest,
      recorder?.best && { ...main,clip:recorder.best,other:guest,id:modelId },
      guestRecorder?.best && guest && { car:guest.car,wheels:guest.wheels,hubs:guest.hubs,
        clip:guestRecorder.best,other:main,id:guestModelId },
    ];
    return options.filter(Boolean).sort((a,b) => b.clip.points-a.clip.points)[0];
  }

  function openReplay() {
    const best = bestReplay();
    if (!best || driftRun?.run.status !== 'finished') return;
    clearControls();
    replayTarget = best;
    replay = createReplayPlayer(best.clip,terrain,padActive());
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    replayBanner.hidden = false;
    hud.classList.add('is-replay');
  }

  function closeReplay() {
    if (!replay) return;
    replay = replayTarget = undefined;
    replayBanner.hidden = true;
    hud.classList.remove('is-replay');
    clearControls();
    resetCamera();
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
  const insideBay = () => garageMode()
    ? !onCircuit && Math.abs(physics.position.x - STALLS[modelId]) < 1.1 && Math.abs(physics.position.z - STALL_Z) < 2.5
    : Math.abs(physics.position.x) < 1.08 && Math.abs(physics.position.z) < 2.5;
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

  function resizeRenderBuffer() {
    const touch = touchScreen.matches;
    const dpr = Math.min(touch ? 1 : profile.dpr,window.devicePixelRatio);
    const pixels = touch ? 750_000 : guest ? 2_500_000 : 3_700_000;
    const autoDpr = Math.min(dpr,Math.sqrt(pixels/(innerWidth*innerHeight))) * renderScale;
    const ratio = graphicsMode === 'auto' ? autoDpr : dpr*profile.scale;
    if (canvas.width !== Math.floor(innerWidth*ratio) || canvas.height !== Math.floor(innerHeight*ratio) || renderer.getPixelRatio() !== ratio) {
      renderer.setDrawingBufferSize(innerWidth,innerHeight,ratio);
    }
  }

  function setCameraAspect(viewCamera, aspect) {
    if (viewCamera.aspect === aspect) return;
    viewCamera.aspect = aspect;
    viewCamera.updateProjectionMatrix();
  }

  function quality() {
    profile = selectProfile();
    $('#graphics').value = graphicsMode;
    renderer.shadowMap.enabled = profile.shadows;
    shadowDirty = true;
    world.dust.visible = profile.shadows;
    resizeRenderBuffer();
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
      $('#job-label').textContent = 'ГАРАЖ / ' + FLEET[modelId].code;
      title.textContent = manual ? partLabels[manual.part][0] : 'Твой гараж';
      jobs.textContent = manual ? SERVICE_STEPS[manual.part][manual.step] + ' · подойди к метке'
        : seated ? 'Начни заезд из бокса. Перед стартом можно изменить настройки.'
          : 'Подойди к водительской двери любой машины и нажми E. P — тюнинг и обслуживание.';
      reading.hidden = false;
      reading.textContent = `Кузов ${Math.floor(wear.body)}% · Шины ${Math.floor(wear.tires)}% · Тормоза ${Math.floor(wear.brakes)}% · АКБ ${Math.floor(wear.battery)}%`;
      if (!manual && lastScore !== undefined) title.textContent = `Заезд · ${number.format(lastScore)} очков`;
      $('#money').textContent = `Рекорд ${number.format(wear[routeFor(soloRoute.value).short ? 'shortBest' : 'best'])}`;
      raceStart.hidden = !seated || onCircuit;
      $('#solo-route-row').hidden = raceStart.hidden;
      return;
    }
    $('#job-label').textContent = `ЗАКАЗ ${String(career.completed + 1).padStart(2, '0')} · ${career.scanner ? 'СКАНЕР КУПЛЕН' : 'БОКС 01'}`;
    $('#solo-route-row').hidden = true;
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
    let hints;
    const label = (action,index=0) => keyLabel(pit.keys[index][action]);
    if (guest) hints = [['Игрок 1', keyboardSummary(0)],['Игрок 2',keyboardSummary(1)],
      [label('recover'),'вернуть 1'],[label('recover',1),'вернуть 2'],['T','обоих на старт']];
    else if (onCircuit) hints = [[label('gas'),'газ'],[label('brake'),'тормоз / назад'],
      [label('left')+' / '+label('right'),'руль'],[label('handbrake'),'ручник'],['ПКМ + мышь','обзор'],['C','центр камеры'],['T','повтор']];
    else if (garageMode()) hints = seated ? [['Enter', 'на трассу'], ['E', 'выйти'], ['P', 'тюнинг']]
      : [['WASD', 'ходьба'], ['Мышь', 'осмотр'], ['E', 'действие'], ['P', 'обслуживание'], ['H / B', 'капот / багажник']];
    else hints = seated
      ? [['W', 'газ'], ['S', 'тормоз / назад'], ['A / D', 'руль'], ['Space', 'ручник'], ['R', 'мотор'], ['G', 'ворота'], ['C', 'камера'], ['E', 'выйти'], ['T', 'эвакуатор']]
      : [['WASD', 'ходьба'], ['Мышь', 'осмотр'], ['E', 'действие'], ['H', 'капот'], ['B', 'багажник'], ['G', 'ворота'], ['L', 'подъёмник'], ['T', 'эвакуатор']];
    $('#keys').innerHTML = hints.map(([button, description]) => `<span><kbd>${button}</kbd> ${description}</span>`).join('');
  }

  function setCar(id) {
    cancelManual();
    rig.root.removeFromParent();
    rig = visuals[id];
    model = MODELS[id];
    modelId = id;
    physics.setModel(model);
    car.scale.z = model.length;
    const inFleet = garageMode() || state === 'menu';
    if (inFleet) physics.reset(STALLS[id], STALL_Z);
    for (const [key, x] of Object.entries(STALLS)) {
      const parkedRig = visuals[key];
      parkedRig.root.removeFromParent();
      for (const paint of parkedRig.paints) paint.color.set(pit.cars[key].color);
      closeRig(parkedRig);
      if (!inFleet || key === id) continue;
      club.room.add(parkedRig.root);
      parkedRig.root.position.set(x,-.025,STALL_Z);
      parkedRig.root.rotation.set(0,Math.PI,0);
      parkedRig.root.scale.set(1,1,MODELS[key].length);
    }
    car.add(rig.root);
    rig.root.position.set(0,0,0);
    rig.root.rotation.set(0,0,0);
    rig.root.scale.setScalar(1);
    for (const paint of rig.paints) paint.color.set(inFleet ? pit.cars[id].color : model.color);
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

  function closeRig(visual) {
    visual.hood.rotation.x = visual.trunk.rotation.x = visual.batteryHatch.rotation.x = 0;
    visual.engine.visible = visual.bayLight.visible = visual.cargoLight.visible = false;
    for (const panel of Object.values(visual.carDoors)) panel.rotation.y = 0;
  }

  function openPitPanel() {
    if (manual) {
      cancelManual();
      updateJob();
      return tell('Ручное обслуживание отменено. Машина собрана.');
    }
    if (!canTune()) return tell('Поставь машину в центр бокса и остановись.');
    clearControls();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    renderPitPanel();
    pitPanel.showModal();
  }

  const partLabels = {
    tires: ['Шины', 'Заменить'],
    body: ['Кузов', 'Починить'],
    brakes: ['Тормоза', 'Обслужить'],
    battery: ['Аккумулятор', 'Заменить'],
  };
  $('#pit-fleet').innerHTML = Object.entries(FLEET).map(([id, details]) => `
    <button type="button" class="pit-car" data-car="${id}">
      <span class="label">${details.code}</span><strong>${MODELS[id].name}</strong>
      <small>${details.engine}</small><small>${details.feel}</small>
    </button>`).join('');
  $('#pit-parts').innerHTML = Object.entries(partLabels).map(([part, [label, action]]) => `
    <div class="pit-row"><span>${label} <small data-condition="${part}"></small></span>
    <span class="service-options"><button type="button" data-service="${part}" aria-label="${action}: ${label} автоматически">Авто</button>
    <button type="button" data-manual="${part}" aria-label="${action}: ${label} вручную">Вручную</button></span></div>`).join('');
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
    if (seated) resetCamera();
    else camera.lookAt(STALLS[id], 1.05, STALL_Z);
    applyGarageChanges();
  });
  $('#pit-parts').addEventListener('click', event => {
    const button = event.target.closest('button');
    const part = button?.dataset.service ?? button?.dataset.manual;
    if (!canTune() || !Object.hasOwn(partLabels, part)) return;
    if (button.dataset.manual) {
      if (seated) {
        exitCar();
        if (seated) return;
      }
      physics.running = false;
      hoodOpen = hoodReleased = trunkOpen = hatchOpen = false;
      manual = { part, step: 0 };
      pitPanel.close();
      updateJob();
      tell('Подойди к метке и нажми E. P отменяет обслуживание.', 4);
      return;
    }
    condition()[part] = 100;
    repairSoundUntil = performance.now() + 600;
    applyGarageChanges();
  });
  $('#pit-tune').addEventListener('change', event => {
    const name = event.target.dataset.setup;
    if (!canTune() || !Object.hasOwn(SETUPS, name)) return;
    const value = Number(event.target.value);
    if (!Object.hasOwn(SETUPS[name].values,value)) return;
    condition()[name] = value;
    applyGarageChanges();
  });
  $('#pit-drift-default').onclick = () => {
    if (!canTune()) return;
    Object.assign(condition(),DRIFT_SETUP);
    applyGarageChanges();
  };
  $('#pit-color').addEventListener('input', event => {
    if (!canTune()) return;
    condition().color = event.target.value;
    for (const paint of rig.paints) paint.color.set(event.target.value);
    persistPit();
  });

  function show(next) {
    if (garageMode()) {
      if (onCircuit) finishRun();
      persistPit();
    }
    stopDuo();
    layout = mainLayout;
    training = tandem = undefined;
    recorder = guestRecorder = previousBest = undefined;
    closeReplay();
    clearControls();
    state = next;
    seated = cockpit = false;
    onCircuit = false;
    player.copy(next === 'pit' ? walkStart : startPose);
    walkVelocity.set(0, 0, 0);
    gateOpen = false;
    door.position.y = 0;
    driftRun = null;
    lastScore = undefined;
    arena.markGate(-1);
    arena.fx.reset();
    padEffects.reset();
    setCar(next === 'shift' ? job().car : pit.selected);
    camera.position.copy(player);
    camera.lookAt(0, 1.2, next === 'pit' ? STALL_Z : .4);
    resetCamera();
    syncScene();
    $('#welcome').hidden = state !== 'menu';
    hud.hidden = state === 'menu';
    $('#menu').hidden = state === 'menu';
    notice.hidden = true;
    updateJob();
    updateControls();
    if (state !== 'menu') resumeAudio();
  }

  function manualTarget() {
    if (!manual) return null;
    if (manual.part === 'battery') return carPoint(0,.78,2.8);
    if (manual.part === 'body') return carPoint(0,.80,-2.82);
    return carPoint(-1.63,.48,-1.5);
  }

  function removeWheel() {
    const wheel = rig.wheels[0];
    removedWheel = { wheel, hub: rig.hubs[0] };
    brakeDisc.position.set(0,0,0);
    removedWheel.hub.add(brakeDisc);
    brakeDisc.visible = true;
    const point = carPoint(-1.63,0,-2.22);
    detachedWheel.position.set(point.x,.335,point.z);
    detachedWheel.rotation.set(0,Math.PI,0);
    detachedWheel.add(wheel);
    wheel.rotation.x = 0;
  }

  function installWheel() {
    if (!removedWheel) return;
    removedWheel.hub.add(removedWheel.wheel);
    removedWheel.wheel.rotation.x = 0;
    removedWheel = undefined;
    brakeDisc.visible = false;
  }

  function liftClubCar(raised) {
    lifted = raised;
    physics.setLift(raised ? 1.02 : 0);
    club.liftArms.position.set(STALLS[modelId], raised ? 1.19 : 0, STALL_Z);
    club.liftArms.visible = raised;
  }

  function cancelManual() {
    if (!manual) return;
    installWheel();
    if (lifted) liftClubCar(false);
    hoodOpen = hoodReleased = trunkOpen = hatchOpen = false;
    manual = undefined;
  }

  function advanceManual() {
    const { part, step } = manual;
    if (part === 'battery') {
      if (step === 0) trunkOpen = true;
      if (step === 1) hatchOpen = true;
      if (step === 3) trunkOpen = hatchOpen = false;
    } else if (part === 'body') {
      hoodOpen = step < 2;
    } else {
      if (step === 0) liftClubCar(true);
      if (step === 1) removeWheel();
      if (step === (part === 'brakes' ? 3 : 2)) installWheel();
      if (step === SERVICE_STEPS[part].length - 1) liftClubCar(false);
    }
    repairSoundUntil = performance.now() + 520;
    manual.step++;
    if (manual.step === SERVICE_STEPS[part].length) {
      condition()[part] = 100;
      manual = undefined;
      physics.setSetup(setupFor(condition()));
      persistPit();
      tell('Готово. Узел обслужен.');
    } else {
      const target = manualTarget();
      camera.lookAt(target.x, part === 'battery' ? 1.04 : lifted ? 1.36 : .67, target.z);
      tell(SERVICE_STEPS[part][manual.step] + ' · E', 2);
    }
    updateJob();
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
    if (pitPanel.open || repairTime > 0 || onCircuit) return null;
    if (manual) return near(manualTarget(), 1.85)
      ? { label: SERVICE_STEPS[manual.part][manual.step], run: advanceManual } : null;
    if (garageMode() && !seated) {
      for (const [id, x] of Object.entries(STALLS)) {
        if (player.x <= x + .99 || !nearPoint(x + 1.43, STALL_Z + .9, 1.86)) continue;
        return { label: 'Сесть в ' + MODELS[id].name, run() {
          if (id !== modelId) {
            pit.selected = id;
            lastScore = undefined;
            setCar(id);
            persistPit();
          }
          enterCar();
        } };
      }
    }
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
    if (garageMode()) return manualTarget();
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
    if (garageMode()) {
      updateJob();
      tell('Enter — на трассу. P — настройки. E — выйти.');
    } else tell('R — завести двигатель. G — открыть ворота. E — выйти.');
  }

  const shutter = { x: 0, z: 7.95, w: 5.12, d: .25, h: 4.35 };
  const garageWithShutter = [...barriers, shutter];
  function hitsRectangle(x, z, radius, box) {
    return Math.hypot(Math.max(0,Math.abs(x-box.x)-box.w/2),
      Math.max(0,Math.abs(z-box.z)-box.d/2)) < radius;
  }
  function blocked(x, z, radius = .27) {
    if (barriers.some(box => hitsRectangle(x,z,radius,box))) return true;
    if (garageMode() && !onCircuit && Object.entries(STALLS).some(([id, px]) => id !== modelId &&
      hitsRectangle(x,z,radius,{ x: px, z: STALL_Z, w: 2.0, d: 4.83 * MODELS[id].length }))) return true;
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
    if (garageMode()) updateJob();
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
    if (garageMode()) {
      if (onCircuit) return startRace();
      if (manual) return openPitPanel();
      return;
    }
    if (physics.totalSpeed > 2 && V(0, 1, 0).applyQuaternion(physics.rotation).y > .5) {
      return tell('Остановись перед вызовом эвакуатора.');
    }
    physics.reset();
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
    const x = Number(walkKey('right', 'KeyD', 'ArrowRight')) - Number(walkKey('left', 'KeyA', 'ArrowLeft'));
    const z = Number(walkKey('brake', 'KeyS', 'ArrowDown')) - Number(walkKey('gas', 'KeyW', 'ArrowUp'));
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
    if (state === 'menu' || pitPanel.open) return;
    if (onCircuit && seated) {
      if (orbitHeld) orbit.move(dx, dy, performance.now());
      return;
    }
    if (seated) return;
    camera.rotation.y -= dx * .002;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * .002, -1.35, 1.35);
  }

  canvas.addEventListener('mousedown', event => {
    if (state === 'menu' || pitPanel.open) return;
    if (onCircuit && seated && event.button === 2) {
      event.preventDefault();
      orbitHeld = true;
    } else if (!seated && event.button === 0) {
      mouseDown = true;
    } else return;
    if (document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock()?.catch(() => {}); } catch { /* Dragging also works without pointer lock. */ }
    }
  });
  canvas.addEventListener('contextmenu', event => { if (onCircuit) event.preventDefault(); });
  window.addEventListener('mouseup', event => {
    if (event.button === 2 && orbitHeld) {
      orbitHeld = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    if (event.button === 0) mouseDown = false;
  });
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement === canvas || mouseDown || orbitHeld) look(event.movementX, event.movementY);
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) return;
    if (onCircuit) {
      orbitHeld = false;
    } else {
      mouseDown = false;
      clearControls();
    }
  });
  window.addEventListener('blur', () => { clearControls(); mouseDown = orbitHeld = false; });
  document.addEventListener('visibilitychange', clearControls);

  document.addEventListener('keydown', event => {
    if (bindingsPanel.open) {
      if (!bindingTarget || event.ctrlKey || event.metaKey || event.altKey || event.code === 'Tab') return;
      event.preventDefault();
      if (event.repeat) return;
      const { index,action } = bindingTarget;
      if (event.code === 'Escape') {
        bindingTarget = undefined;
        bindingsStatus.textContent = 'Выбери действие и нажми новую клавишу.';
      } else if (!allowedKey(event.code)) {
        bindingsStatus.textContent = 'Эта клавиша зарезервирована. Нажми другую.';
      } else if (pit.keys.some((keys,i) => Object.entries(keys).some(([name,code]) => code === event.code && (i !== index || name !== action)))) {
        bindingsStatus.textContent = 'Клавиша уже занята. Выбери другую.';
      } else {
        pit.keys[index][action] = event.code;
        bindingTarget = undefined;
        bindingsStatus.textContent = 'Управление сохранено.';
        persistPit();
        renderBindings();
        updateControls();
      }
      return;
    }
    if (state === 'menu' || pitPanel.open || duoSetup.open || practiceSetup.open || event.ctrlKey || event.metaKey || event.altKey) return;
    if (replay) {
      if (event.code === 'Escape') closeReplay();
      return;
    }
    if (event.target instanceof Element && event.target.matches('a,input,select,textarea')) return;
    if (event.target instanceof HTMLButtonElement && ['Space','Enter'].includes(event.code)) return;
    if (/^(Key[WASDEBHRGCLTP]|Arrow(Up|Down|Left|Right)|Space|ShiftRight|Numpad0|Enter)$/.test(event.code) ||
        onCircuit && pit.keys.some(keys => Object.values(keys).includes(event.code))) event.preventDefault();
    controls.add(event.code);
    if (event.repeat || repairTime > 0) return;
    if (onCircuit) {
      if (event.code === 'Escape') orbitHeld = false;
      if (event.code === 'KeyC') orbit.center();
      if (event.code === 'KeyT') startRace();
      if (driverCodes(0,'handbrake').includes(event.code)) tappedHandbrake = true;
      if (guest) {
        if (driverCodes(1,'handbrake').includes(event.code)) guestTap = true;
        if (event.code === pit.keys[0].recover) recoverDriver(false);
        if (event.code === pit.keys[1].recover) recoverDriver(true);
      }
      return;
    }
    if (manual && !['KeyE', 'KeyP'].includes(event.code)) return;
    if (garageMode() && ['KeyR', 'KeyG', 'KeyL'].includes(event.code)) return;
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
      case 'Enter': if (garageMode()) startRace(); break;
      case 'KeyT': recover(); break;
    }
  });
  document.addEventListener('keyup', event => {
    controls.delete(event.code);
    if (onCircuit) {
      for (const action of ['brake','gas']) {
        if (driverCodes(0,action).includes(event.code) && !drivingKey(0,action)) physics.releasePedal(action);
        if (guest && driverCodes(1,action).includes(event.code) && !drivingKey(1,action)) guest.physics.releasePedal(action);
      }
    } else {
      if (['KeyS','ArrowDown'].includes(event.code) && !walkKey('brake', 'KeyS', 'ArrowDown')) physics.releasePedal('brake');
      if (['KeyW','ArrowUp'].includes(event.code) && !walkKey('gas', 'KeyW', 'ArrowUp')) physics.releasePedal('gas');
    }
  });
  const touchControls = $('#touch-controls');
  const touchActions = $('#touch-actions');
  const touchHandbrake = touchControls.querySelector('[data-drive="handbrake"]');
  const touchPedals = [...touchControls.querySelectorAll('[data-drive]')];
  const touchCommands = [...touchActions.querySelectorAll('[data-command]')];
  const touchMenuOpen = () => state === 'menu' || pitPanel.open || practiceSetup.open || duoSetup.open ||
    bindingsPanel.open || replay;

  for (const button of touchPedals) {
    const drive = button.dataset.drive;
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || touchMenuOpen()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touchDrive.add(drive);
      if (drive === 'handbrake' && seated) tappedHandbrake = true;
      resumeAudio();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, () => {
        if (!touchDrive.delete(drive)) return;
        if (drive === 'gas' || drive === 'brake') {
          const keyboard = onCircuit ? drivingKey(0, drive)
            : drive === 'gas' ? key('KeyW', 'ArrowUp') : key('KeyS', 'ArrowDown');
          if (!keyboard) physics.releasePedal(drive);
        }
      });
    }
  }
  touchActions.addEventListener('click', event => {
    const button = event.target.closest('[data-command]');
    if (!button || touchMenuOpen()) return;
    const code = button.dataset.command;
    document.dispatchEvent(new KeyboardEvent('keydown', { code }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code }));
    resumeAudio();
  });

  let lookPointer;
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || touchMenuOpen() || lookPointer) return;
    lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    orbitHeld = onCircuit && seated;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (lookPointer?.id !== event.pointerId) return;
    look(event.clientX - lookPointer.x, event.clientY - lookPointer.y);
    lookPointer.x = event.clientX;
    lookPointer.y = event.clientY;
  });
  canvas.addEventListener('lostpointercapture', event => {
    if (lookPointer?.id !== event.pointerId) return;
    lookPointer = undefined;
    orbitHeld = false;
  });

  action.onclick = () => { action.blur(); interaction()?.run(); };
  $('#bindings-open').onclick = () => { clearControls(); bindingsPanel.showModal(); };
  bindingsPanel.onclose = () => { bindingTarget = undefined; clearControls(); $('#bindings-open').blur(); };
  bindingsGrid.onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    bindingTarget = { index:Number(button.dataset.player),action:button.dataset.action };
    bindingsStatus.textContent = `${DRIVING_ACTIONS[bindingTarget.action]} · нажми новую клавишу или Esc.`;
  };
  $('#bindings-reset').onclick = () => {
    pit.keys = loadBindings();
    bindingTarget = undefined;
    persistPit();
    renderBindings();
    updateControls();
    bindingsStatus.textContent = 'Восстановлены исходные клавиши.';
  };
  $('#start').onclick = () => { $('#start').blur(); show('pit'); };
  $('#duo-open').onclick = () => { $('#duo-open').blur(); duoSetup.showModal(); };
  $('#duo-cancel').onclick = () => duoSetup.close();
  $('#duo-form').onsubmit = event => {
    event.preventDefault();
    const first = $('#duo-car-1').value, second = $('#duo-car-2').value;
    duoSetup.close();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    startDuo(first,second,$('#duo-mode').value,routeFor($('#duo-route').value),$('#duo-contact').value === 'on');
  };
  $('#duo-mode').onchange = event => {
    $('#duo-contact-row').hidden = event.target.value !== 'free';
    $('#duo-rules').textContent = {
      free: 'Катайтесь по трассе сколько хотите. T возвращает обе машины на старт.',
      points: '90 секунд. Побеждает тот, кто наберёт больше очков.',
      tandem: 'Два заезда по 45 секунд. Ведомый получает бонус за близость и синхронный занос. После первого заезда поменяйтесь ролями.',
    }[event.target.value];
  };
  $('#practice-open').onclick = () => {
    $('#practice-open').blur();
    $('#practice-car').value = pit.selected;
    practiceSetup.showModal();
  };
  $('#practice-cancel').onclick = () => practiceSetup.close();
  $('#practice-form').onsubmit = event => {
    event.preventDefault();
    const id = $('#practice-car').value;
    const zone = practiceZone.value;
    const route = routeFor(practiceRoute.value);
    if (!Object.hasOwn(FLEET,id) || zone !== 'pad' && !route.gates[Number(zone)]) return;
    practiceSetup.close();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    show('pit');
    layout = route;
    setCar(id);
    training = zone;
    seated = true;
    startRace();
  };
  assistLevel.onchange = () => {
    pit.assist = assistLevel.value;
    physics.setAssist(pit.assist);
    guest?.physics.setAssist(pit.assist);
    assistLevel.blur();
    persistPit();
  };
  finishButton.onclick = () => { finishButton.blur(); finishRun(); };
  replayButton.onclick = () => { replayButton.blur(); openReplay(); };
  $('#replay-close').onclick = closeReplay;
  duoReplayButton.onclick = () => { duoReplayButton.blur(); openReplay(); };
  $('#duo-retry').onclick = () => { $('#duo-retry').blur(); startRace(); };
  $('#duo-back').onclick = () => { $('#duo-back').blur(); returnToClub(); };
  $('#shift').onclick = () => { $('#shift').blur(); show('shift'); };
  raceStart.onclick = () => { raceStart.blur(); startRace(); };
  soloRoute.onchange = () => { soloRoute.blur(); updateJob(); };
  raceRetry.onclick = () => { raceRetry.blur(); startRace(); };
  raceReturn.onclick = () => { raceReturn.blur(); returnToClub(); };
  pitOpen.onclick = () => { pitOpen.blur(); openPitPanel(); };
  pitPanel.addEventListener('close', () => {
    if (document.activeElement instanceof HTMLElement && pitPanel.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  });
  window.addEventListener('pagehide', () => { if (dirty) persistPit(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dirty) persistPit();
  });
  $('#menu').onclick = () => { $('#menu').blur(); show('menu'); };
  $('#graphics').onchange = event => {
    if (!Object.hasOwn(GRAPHICS,event.target.value)) return;
    graphicsMode = career.graphics = event.target.value;
    career.high = graphicsMode !== 'performance';
    renderScale = 1;
    headroom = fpsTime = fpsFrames = 0;
    event.target.blur();
    quality();
    saved();
  };
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
      audio ??= createDriftAudio(new AudioContext());
      audio.context.resume().catch(() => {});
    } catch { /* The game also plays without an audio device. */ }
  }

  function sound(now) {
    if (!audio) return;
    if (career.muted || state === 'menu') {
      audio.player({});
      audio.guest({});
      return;
    }
    const engineVoice = (driver,id,side,load) => ({
      id, side, load, rpm:driver.rpm, speed:driver.totalSpeed, slip:driver.slip,
      grounded:onCircuit && driver.grounded,
      curbing:onCircuit && !padActive() && driver.totalSpeed>4 &&
        [0,1,2,3].some(index => {
          const contact=driver.wheelContact(index);
          return contact && terrain.curbAt(contact.x,contact.z);
        }),
      gain:driver.running ? (seated ? .076 : .035/(1+player.distanceTo(car.position)*.13)) : 0,
    });
    const main = engineVoice(physics,modelId,guest ? -.38 : 0,onCircuit ? drivingKey(0,'gas') : walkKey('gas', 'KeyW', 'ArrowUp'));
    if (replay) {
      main.id = replayTarget.id;
      main.rpm = replay.rpm;
      main.gain = .063;
      main.slip = 0;
      main.curbing = false;
    } else if (!physics.running) {
      const movingGate = Math.abs(door.position.y-(gateOpen ? 4.5 : 0))>.08;
      const tool = now<repairSoundUntil ? 95 : movingGate ? 43 : 0;
      if (tool) { main.tool = tool; main.gain = .035; }
    }
    audio.player(main);
    audio.guest(guest && !replay ? engineVoice(guest.physics,guestModelId,.38,drivingKey(1,'gas')) : {});
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
      totalSpeed: physics.totalSpeed, service: walkKey('brake', 'KeyS', 'ArrowDown'),
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
    if (pitPanel.open || replay) return;
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
    if (seated && unsecured && (walkKey('gas', 'KeyW', 'ArrowUp') || walkKey('brake', 'KeyS', 'ArrowDown')) && !leaving && noticeUntil < performance.now()) {
      tell('Перед выездом закрой капот и багажник.');
    }
    const handbrake = seated && ((onCircuit ? drivingKey(0,'handbrake') : walkKey('handbrake', 'Space')) || tappedHandbrake);
    tappedHandbrake = false;
    const drifting = garageMode() && onCircuit;
    const canDrive = seated && (!garageMode() || onCircuit);
    const guestBrake = guest && (guestTap || drivingKey(1,'handbrake'));
    guestTap = false;
    physics.tick({
      gas: canDrive && !unsecured && (onCircuit ? drivingKey(0,'gas') : walkKey('gas', 'KeyW', 'ArrowUp')),
      reverse: canDrive && !unsecured && (onCircuit ? drivingKey(0,'brake') : walkKey('brake', 'KeyS', 'ArrowDown')),
      turn: canDrive ? Number(onCircuit ? drivingKey(0,'right') : walkKey('right', 'KeyD', 'ArrowRight'))
        - Number(onCircuit ? drivingKey(0,'left') : walkKey('left', 'KeyA', 'ArrowLeft')) : 0,
      handbrake, drift: drifting,
      occupied: canDrive, parking: leaving || unsecured || garageMode() && !onCircuit, fault: broken(), gateY: door.position.y,
    }, guest && {
      gas: drivingKey(1,'gas'), reverse: drivingKey(1,'brake'),
      turn: Number(drivingKey(1,'right'))-Number(drivingKey(1,'left')),
      handbrake: guestBrake, drift: true, occupied: true,
    });
    if (garageMode() && !guest && !training) updateCondition(handbrake);
    if (onCircuit) (padActive() ? padEffects : arena.fx).tick(STEP,physics,profile.shadows,handbrake);
    if (guest) {
      guest.effects.tick(STEP,guest.physics,profile.shadows,guestBrake);
      if (driftRun.run.status === 'ready' && Math.max(physics.totalSpeed,guest.physics.totalSpeed)*3.6 >= 5) {
        driftRun.start();
        guest.race.start();
      }
      if (driftRun.run.status === 'running') {
        driftRun.tick(STEP,raceTelemetry(physics));
        guest.race.tick(STEP,raceTelemetry(guest.physics));
        recorder?.tick(STEP,physics,driftRun.run,guest.physics);
        guestRecorder?.tick(STEP,guest.physics,guest.race.run,physics);
        if (tandem) {
          const states = [[physics,driftRun.run],[guest.physics,guest.race.run]].map(([driver,run]) => ({
            ...raceTelemetry(driver), sliding:run.sliding, warning:run.warning,
          }));
          tandem.tick(STEP,states);
          if (driftRun.run.status === 'finished' && tandem.closeHeat([driftRun.run.score,guest.race.run.score])) {
            previousBest = bestReplay();
            startRace(true);
            return;
          }
        }
      }
      const active = !duoFree && driftRun.run.status !== 'finished';
      arena.markGate(active ? driftRun.run.next : -1,active ? guest.race.run.next : -1,layout);
    } else if (onCircuit && driftRun && driftRun.run.status !== 'finished') {
      driftRun.tick(STEP,raceTelemetry(physics));
      recorder?.tick(STEP,physics,driftRun.run);
      if (driftRun.run.status === 'finished') finishRun();
      else arena.markGate(driftRun.run.next,-1,layout);
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
    const cameraBarriers = onCircuit ? (padActive() ? practice.obstacles : arena.obstacles) : garageMode() ? club.obstacles
      : door.position.y < 3.6 ? garageWithShutter : barriers;
    for (const box of cameraBarriers) {
      let entry = 0;
      let exit = fraction;
      const ranges = [
        [lookAt.x, delta.x, box.x - box.w / 2 - .14, box.x + box.w / 2 + .14],
        [lookAt.y, delta.y, (box.y ?? 0)-.12, (box.y ?? 0)+box.h+.14],
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
    desired.copy(lookAt).addScaledVector(delta,fraction);
    if (onCircuit && !padActive()) desired.y = Math.max(desired.y,terrain.heightAt(desired.x,desired.z)+.54);
    return desired;
  }

  function view(dt, now) {
    if (state === 'menu') {
      const t = now / 7000;
      camera.position.set(9.2 + Math.sin(t) * .5, 2.42, -47.1);
      camera.lookAt(1.8, 1.03, STALL_Z);
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
        const offset = THREE.MathUtils.clamp(physics.slip * .34, -.32, .32);
        orbitState = orbit.tick(yaw - offset, dt, now, orbitHeld);
        heading.setFromAxisAngle(direction.set(0, 1, 0), orbitState.heading);
        const radius = 6.7 + Math.min(physics.totalSpeed * .042, 1.3);
        focus = direction.set(0, 1.07, 0).add(car.position);
        desired = eye.set(0, 2.12 + Math.sin(orbitState.pitch) * radius,
          Math.cos(orbitState.pitch) * radius).applyQuaternion(heading).add(focus);
        desired.y = Math.max(.65, desired.y);
      } else {
        desired = transform(eye.set(.05, raceCamera ? 1.60 : 2.63, (raceCamera ? 4.1 : 5.6) + Math.min(physics.totalSpeed * .035, .9)));
        focus = transform(direction.set(0, 1.05, -.45));
      }
      safeChase(focus, desired);
      if (onCircuit || cameraCut || camera.position.distanceTo(desired) > 9) chase.copy(desired);
      else chase.lerp(desired, 1 - Math.exp(-dt * 8.5));
      camera.position.copy(safeChase(focus, chase.clone()));
      camera.lookAt(focus);
    }
    cameraCut = false;
  }

  function renderHud(now) {
    const onFoot = !seated;
    if (touchScreen.matches) {
      touchControls.hidden = touchActions.hidden = Boolean(replay);
      touchHandbrake.hidden = onFoot;
      for (const button of touchPedals) button.classList.toggle('held', touchDrive.has(button.dataset.drive));
      for (const button of touchCommands) button.hidden = button.hasAttribute('data-shift') ? state !== 'shift' : onFoot;
      touchPedals[3].setAttribute('aria-label', seated ? 'Тормоз и задний ход' : 'Назад');
      touchPedals[4].setAttribute('aria-label', seated ? 'Газ' : 'Вперёд');
    }
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
      if (guest) renderDuo();
    else if (onCircuit && driftRun) renderDrift();
      else if (now >= nextPitHud) {
        updateJob();
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
    driftTime.textContent = training ? 'БЕЗ ТАЙМЕРА' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    driftScore.textContent = number.format(run.score);
    driftCombo.textContent = run.chain >= 1 ? `+${Math.floor(run.chain)} · ×${run.multiplier}` : '';
    raceStartBanner.hidden = run.status !== 'ready';
    raceRetry.hidden = !training && run.status === 'running';
    finishButton.hidden = run.status === 'finished' || run.status === 'ready';
    replayButton.hidden = run.status !== 'finished' || !bestReplay();
    const latestEvent = run.events.at(-1)?.id ?? 0;
    if (latestEvent !== eventCursor) {
      eventCursor = latestEvent;
      raceEvents.replaceChildren(...run.events.slice(-3).reverse().map(event => {
        const item = document.createElement('li');
        item.dataset.kind = event.kind;
        item.textContent = event.message + (event.points ? ` · ${event.kind === 'loss' ? '−' : '+'}${event.points}` : '');
        return item;
      }));
    }
    const gas = keyLabel(pit.keys[0].gas);
    driftStatus.textContent = run.status === 'ready' ? (training ? `Нажми ${gas}. T повторяет выбранный участок.` : `Нажми ${gas}. Таймер запустится, когда машина тронется.`)
      : run.status === 'finished' ? 'Заезд завершён. Можно повторить или вернуться в гараж.' : run.warning ? `${run.warning} · серия сброшена`
        : run.sliding ? 'Занос · держи угол и тягу' : `На дуге коротко нажми ручник (${keyLabel(pit.keys[0].handbrake)}) и поймай машину контррулём. Целься в жёлтую зону.`;
    driftSector.textContent = padActive() ? 'Восьмёрки' : `Створ ${run.next+1}/${layout.gates.length} · клипы ${run.clips}`;
    driftAngle.textContent = `Угол ${Math.round(run.angle)}°`;
    driftLaps.textContent = `Круги ${run.lap}`;
    driftBest.textContent = training ? 'Свободная практика' : `Рекорд ${number.format(condition()[layout.short ? 'shortBest' : 'best'])}`;
    mapGate.style.display = run.status === 'finished' ? 'none' : '';
    const gate = layout.gates[run.next].position;
    markerPosition(mapGate, gate.x, gate.z);
  }

  function renderDuo() {
    const runs = [driftRun.run,guest.race.run];
    const drivers = [physics,guest.physics];
    const scores = runs.map((run,i) => tandem
      ? tandem.totals[i]+tandem.bonus[i]+(tandem.done ? 0 : run.score) : run.score);
    for (const [index,fields] of duoDrivers.entries()) {
      const run=runs[index];
      fields.label.textContent = tandem ? `ИГРОК ${index+1} / ${tandem.leader===index ? 'ВЕДУЩИЙ' : 'ВЕДОМЫЙ'}` : `ИГРОК ${index+1}`;
      fields.score.hidden = duoFree;
      fields.score.textContent = number.format(scores[index]);
      const speed=Math.round(drivers[index].totalSpeed*3.6);
      const status=run.warning || (run.chain>=1 ? `+${Math.floor(run.chain)} ×${run.multiplier}` : '');
      const pending=tandem && tandem.leader!==index ? Math.floor(tandem.pending) : 0;
      const telemetry = `${speed} км/ч · ${Math.round(run.angle)}°`;
      fields.info.textContent = duoFree ? telemetry : `${telemetry} · клипы ${run.clips}${status ? ' · '+status : ''}${pending ? ' · тандем +'+pending : ''}`;
    }
    const seconds=Math.ceil(runs[0].time);
    duoTime.textContent = duoFree ? 'СВОБОДНЫЙ ЗАЕЗД' : (tandem ? `ЗАЕЗД ${tandem.heat}/2 · ` : '') + `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    duoReplayButton.hidden = runs[0].status !== 'finished' || !bestReplay();
    const delta=scores[0]-scores[1];
    const startKeys = `${keyLabel(pit.keys[0].gas)} или ${keyLabel(pit.keys[1].gas)}`;
    duoResult.textContent = duoFree ? '' : runs[0].status === 'ready' ? (tandem?.heat===2 ? `Смена ролей · ${startKeys}` : `Нажми ${startKeys}`)
      : runs[0].status === 'finished' ? (delta===0 ? 'Ничья' : `Победил игрок ${delta>0 ? '1' : '2'}`) : '';
  }

  function renderRaceViews(dt) {
    guestContact.visible = !!guest && !replay;
    if (!guest || replay) {
      setCameraAspect(camera,innerWidth/innerHeight);
      renderer.setViewport(0,0,innerWidth,innerHeight);
      renderer.render(scene,camera);
      return;
    }
    guest.draw(dt,accumulated/STEP,safeChase);
    placeContact(guestContact,guest.car.position);
    const width = Math.floor(innerWidth/2);
    setCameraAspect(camera,width/innerHeight);
    setCameraAspect(guest.camera,(innerWidth-width)/innerHeight);
    renderer.setScissorTest(true);
    renderer.setViewport(0,0,width,innerHeight);
    renderer.setScissor(0,0,width,innerHeight);
    renderer.render(scene,camera);
    district.sky.position.copy(guest.camera.position);
    district.sky.updateWorldMatrix(false,false);
    renderer.setViewport(width,0,innerWidth-width,innerHeight);
    renderer.setScissor(width,0,innerWidth-width,innerHeight);
    // The scene was already updated for the first view. Only the sky moved.
    scene.matrixWorldAutoUpdate = false;
    renderer.render(scene,guest.camera);
    scene.matrixWorldAutoUpdate = true;
    renderer.setScissorTest(false);
  }

  function placeContact(mesh, {x,z}) {
    if (onCircuit && !padActive()) {
      const { heightAt } = terrain;
      mesh.position.set(x,heightAt(x,z)+.075,z);
      groundNormal.set(heightAt(x-1,z)-heightAt(x+1,z),2,heightAt(x,z-1)-heightAt(x,z+1)).normalize();
      mesh.quaternion.setFromUnitVectors(planeNormal,groundNormal);
    } else {
      mesh.position.set(x,.023,z);
      mesh.rotation.set(-Math.PI/2,0,0);
    }
  }

  function updateShadowMap(now) {
    if (!profile.shadows || (!shadowDirty && now < shadowDue)) return;
    const changed = (driver,last) => driver.position.distanceToSquared(last.position)>.09 ||
      Math.abs(driver.rotation.dot(last.rotation))<.99985;
    if (!shadowDirty && onCircuit && !replay && !changed(physics,shadowPose) &&
        (!guest || !changed(guest.physics,guestShadowPose))) return;
    renderer.shadowMap.needsUpdate = true;
    shadowDue = now+profile.shadowMs;
    shadowDirty = false;
    shadowPose.position.copy(physics.position);
    shadowPose.rotation.copy(physics.rotation);
    if (guest) {
      guestShadowPose.position.copy(guest.physics.position);
      guestShadowPose.rotation.copy(guest.physics.rotation);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    clock.update(now);
    const elapsed = clock.getDelta();
    if (document.hidden) return;
    const dt = Math.min(elapsed, .1);
    accumulated += dt;
    while (accumulated >= STEP) {
      step();
      accumulated -= STEP;
    }
    if (replay && replay.tick(dt,replayTarget,camera,safeChase)) closeReplay();
    if (!pitPanel.open && !replay) physics.render(car, rig.wheels, accumulated / STEP, rig.hubs);
    car.updateWorldMatrix(true,false);
    placeContact(world.contact,car.position);
    world.contact.visible = !lifted && !replay;
    for (const lamp of rig.lampMeshes) lamp.visible = physics.braking;
    rig.brakeLamps.emissiveIntensity = physics.braking ? 1.2 : rig === bmw ? 0 : .22;
    if (rig.windows) rig.windows.opacity = cockpit ? .16 : .84;
    if (rig.steering) rig.steering.rotation.z = -rig.hubs[0].rotation.y * 4;
    const inWorkshop = state === 'menu' || garageMode() && !onCircuit ||
      position().z < 8.4 && position().z > -8.3 && Math.abs(position().x) < 7.3;
    workLight.castShadow = inWorkshop;
    district.sky.material.uniforms.circuit.value = onCircuit ? 1 : 0;
    district.sunlight.color.setHex(onCircuit ? 0xffc791 : 0xfff1db);
    district.sunlight.position.x = onCircuit ? -45 : -24;
    district.sunlight.position.y = onCircuit ? 19 : 32;
    district.sunlight.castShadow = !inWorkshop;
    district.sunlight.intensity = damp(district.sunlight.intensity, inWorkshop ? .55 : onCircuit ? 2.6 : 2.05, 6, dt);
    const lightZ = replay ? replayTarget.car.position.z : guest ? CLUB_ARENA.z : Math.max(23,position().z);
    const lightX = replay ? replayTarget.car.position.x : onCircuit && !guest ? position().x : 0;
    district.sunlight.position.x += lightX;
    district.sunlight.target.position.x = lightX;
    district.sunlight.position.z = lightZ + (onCircuit ? 34 : 13);
    district.sunlight.target.position.z = lightZ;
    if (!pitPanel.open && !replay) {
      const fieldOfView = garageMode() && !onCircuit && !seated ? 72 : 62;
      if (camera.fov !== fieldOfView) {
        camera.fov = fieldOfView;
        camera.updateProjectionMatrix();
      }
      view(dt, now);
    }
    camera.updateMatrixWorld();
    district.sky.position.copy(camera.position);
    sound(now);
    updateShadowMap(now);
    renderer.info.reset();
    renderRaceViews(dt);
    fpsTime += elapsed;
    fpsFrames++;
    if (fpsTime >= .9) {
      const rate = fpsFrames/fpsTime;
      $('#fps').textContent = Math.round(rate)+' FPS';
      if (graphicsMode === 'auto' && state !== 'menu') {
        headroom = rate >= (touchScreen.matches ? 49 : 57) ? headroom+1 : 0;
        const floor = touchScreen.matches ? .55 : guest ? .60 : .65;
        const next = rate < (touchScreen.matches ? 43 : 49) ? Math.max(floor,renderScale-.08) : headroom >= 3 ? Math.min(1,renderScale+.04) : renderScale;
        if (next !== renderScale) {
          renderScale = next;
          headroom = 0;
          resizeRenderBuffer();
        }
      }
      fpsTime = fpsFrames = 0;
    }
    if (state !== 'menu' && now >= nextHud) {
      renderHud(now);
      nextHud = now + (touchScreen.matches ? 100 : 50);
    }
  }

  quality();
  $('#audio').textContent = career.muted ? 'Звук: выкл' : 'Звук: вкл';
  show('menu');
  const [, equipment, trackKit] = await Promise.all([world.assetsReady, club.equipment, arena.kit]);
  const anisotropy = Math.min(touchScreen.matches ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
  const textures = new Set();
  const filterMaterials = object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) for (const channel of ['map','normalMap','roughnessMap','bumpMap']) {
      if (material[channel]) textures.add(material[channel]);
    }
  };
  scene.traverse(filterMaterials);
  for (const visual of [bmw,f90,cls,supra]) visual.root.traverse(filterMaterials);
  for (const texture of textures) texture.anisotropy = anisotropy;
  const keep = new Set([car, world.contact, guestContact, district.sky, district.sunlight, district.sunlight.target,
    district.marker, arena.group, club.room, practice.root, legacyScenery]);
  for (const object of [...scene.children]) {
    if (!keep.has(object) && !object.isLight) legacyScenery.add(object);
  }
  syncScene();
  $('#loading').textContent = '';
  $('#start').disabled = $('#shift').disabled = $('#duo-open').disabled = $('#practice-open').disabled = false;
  Object.defineProperty(window, 'garageLife', { value: Object.freeze({
    getState: () => ({
      mode: state, seated, cockpit, running: physics.running, speed: physics.speed * 3.6,
      car: physics.position.toArray(), player: player.toArray(), yaw: camera.rotation.y, gate: door.position.y, lifted,
      hood: hoodOpen, trunk: trunkOpen, batteryHatch: hatchOpen, drift: driftRun ? { ...driftRun.run } : null, leaving, phase: phase(), job: job().id, money: career.money, completed: career.completed,
      practice: training ?? null, route: layout.short ? 'short' : 'main', replay: !!replay, bestReplay: bestReplay()?.clip.points ?? null,
      tandem: tandem ? { heat:tandem.heat, leader:tandem.leader+1, done:tandem.done } : null,
      duo: guest ? { car: guest.physics.position.toArray(), speed: guest.physics.totalSpeed*3.6,
        drift: { ...guest.race.run } } : null,
      model: modelId, onCircuit, orbit: { ...orbitState }, camera: camera.position.toArray(),
      manual: manual ? { ...manual, wheelRemoved: !!removedWheel } : null, fleet: Object.keys(STALLS),
      workshopAsset: equipment, trackAsset: trackKit, importedCars: [f90,cls,supra].filter(rig => rig.external).length, setup: garageMode() ? { ...condition() } : null,
      assets: { ...world.assetStatus }, render: { ...renderer.info.render }, graphics: graphicsMode,
    }),
  }) });
  requestAnimationFrame(frame);
}
