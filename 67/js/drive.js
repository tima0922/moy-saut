import * as THREE from 'three';
import { createWorld } from './world.js';
import { batchSharedMeshes } from './garage-visuals.js';
import { fitE39 } from './bmw.js';
import { createDistrict, SHOP, TRACK } from './district.js';
import { createPhysics, MODELS, STEP } from './vehicle.js';
import { JOBS, advance, loadCareer, saveCareer, makeRoadTest } from './career.js';

const $ = selector => document.querySelector(selector);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = THREE.MathUtils.damp;
const canvas = $('#scene');
const career = loadCareer(window.localStorage);
const controls = new Set();
const key = (...codes) => codes.some(code => controls.has(code));
const saved = () => saveCareer(window.localStorage, career);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  await boot();
} catch (error) {
  console.error(error);
  $('#loading').textContent = 'Не удалось загрузить 3D. Открой игру через веб-сервер в Chrome или Edge с включённым WebGL 2.';
}

async function boot() {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = new THREE.PerspectiveCamera(62, 1, .035, 155);
  camera.rotation.order = 'YXZ';
  const world = createWorld(renderer, { districtMode: true });
  const district = createDistrict(world, renderer);
  const bmw = await fitE39(world);
  for (const object of [world.scene, world.car, world.engine, world.lift, world.arms]) {
    batchSharedMeshes(object);
  }
  const physics = await createPhysics(district.obstacles);
  const { car, scene, door, key: workLight } = world;
  const { hood, trunk, carDoors, wheels, hubs, steering, paints, brakeLamps, lampMeshes } = bmw;
  world.arms.position.y = -.17;
  const wheelMark = new THREE.Mesh(new THREE.TorusGeometry(.344, .013, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: .68 }));
  wheelMark.position.x = -.15;
  wheelMark.rotation.y = Math.PI / 2;
  hubs[0].add(wheelMark);

  const startPose = V(-4.2, 1.68, -3.6);
  const player = startPose.clone();
  const chase = V(0, 0, 0);
  const eye = V(0, 0, 0);
  const direction = V(0, 0, 0);
  const clock = new THREE.Timer();
  clock.connect(document);
  let state = 'menu';
  let model = MODELS.sedan;
  let seated = false;
  let cockpit = false;
  let lifted = false;
  let gateOpen = false;
  let hoodOpen = false;
  let hoodReleased = false;
  let trunkOpen = false;
  let leaving = false;
  let doorSide = 'left';
  const walkVelocity = V(0, 0, 0);
  let leftDoorTimer = 0;
  let noticeUntil = 0;
  let mouseDown = false;
  let accumulated = 0;
  let fpsTime = 0;
  let fpsFrames = 0;
  let roadTest;
  let ignitionSeconds = 0;
  let parked = true;
  let cameraCut = true;
  let repairSoundUntil = 0;
  let repairTime = 0;
  let audio;

  let brakeResult;
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
    renderer.setPixelRatio(Math.min(career.high ? 1.75 : 1.25, window.devicePixelRatio));
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
    if (state === 'roam') {
      $('#job-label').textContent = 'СВОБОДНАЯ ПОЕЗДКА';
      title.textContent = 'Промзона открыта';
      jobs.textContent = 'Садись за руль, выезжай и исследуй район. Попробуй тест-полосу или парковку у магазина.';
      return;
    }
    $('#job-label').textContent = `ЗАКАЗ ${String(career.completed + 1).padStart(2, '0')} · ${career.scanner ? 'СКАНЕР КУПЛЕН' : 'БОКС 01'}`;
    title.textContent = current.title;
    const tasks = {
      offer: current.complaint + ' Подойди к столу приёмки.',
      diagnose: current.id === 'battery' ? 'Подойди к багажнику, открой его (B) и замерь напряжение справа.'
        : 'Подойди к переднему левому колесу. Проверь его клавишей E.',
      parts: `Забери в магазине деталь «${current.part}». Точка выдачи отмечена на карте.`,
      repair: current.id === 'battery' ? 'Открой багажник (B), затем установи аккумулятор справа.'
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
      ? [['W', 'газ'], ['S', 'тормоз / задний ход'], ['A', 'влево'], ['D', 'вправо'], ['Space', 'ручник'], ['R', 'зажигание'], ['G', 'ворота'], ['C', 'камера'], ['H', 'замок капота'], ['B', 'багажник'], ['E', 'выйти'], ['T', 'эвакуатор']]
      : [['WASD', 'ходьба'], ['Мышь', 'осмотр'], ['Shift', 'бег'], ['E', 'действие'], ['H', 'капот'], ['B', 'багажник'], ['G', 'ворота'], ['L', 'подъёмник'], ['T', 'эвакуатор']];
    $('#keys').innerHTML = hints.map(([button, description]) => `<span><kbd>${button}</kbd> ${description}</span>`).join('');
  }

  function setCar(id) {
    model = MODELS[id];
    physics.setModel(model);
    car.scale.z = model.length;
    for (const paint of paints) paint.color.set(model.color);
    hoodOpen = hoodReleased = trunkOpen = lifted = leaving = false;
    hood.rotation.x = trunk.rotation.x = 0;
    world.arms.position.y = -.17;
    carDoors.left.rotation.y = carDoors.right.rotation.y = 0;
    leftDoorTimer = 0;
    repairTime = 0;
    brakeResult = null;
    ignitionSeconds = 0;
    roadTest = makeRoadTest(job().id, TRACK);
    parked = true;
    cameraCut = true;
    physics.render(car, wheels, 1, hubs);
  }

  function show(next) {
    controls.clear();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    state = next;
    seated = cockpit = false;
    player.copy(next === 'roam' ? V(1.62, 1.68, .10) : startPose);
    walkVelocity.set(0,0,0);
    gateOpen = false;
    door.position.y = 0;
    setCar(state === 'roam' ? 'sedan' : job().car);
    camera.position.copy(player);
    camera.lookAt(0, 1.2, next === 'roam' ? .48 : .4);
    $('#welcome').hidden = state !== 'menu';
    hud.hidden = state === 'menu';
    $('#menu').hidden = state === 'menu';
    notice.hidden = true;
    $('#start').innerHTML = phase() === 'offer' ? 'Начать смену <b>↗</b>' : 'Продолжить смену <b>↗</b>';
    updateJob();
    updateControls();
    if (state !== 'menu') resumeAudio();
  }

  function completePhase(expected) {
    if (!advance(career, expected)) return;
    saved();
    updateJob();
  }

  function repairZone() {
    return job().id === 'battery' ? carPoint(.54, .74, 2.49) : carPoint(-1.15, .5, -1.52);
  }

  const desk = V(-4.7, .08, -4.4);

  function interaction() {
    if (repairTime > 0) return null;
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
          if (job().id === 'battery' && !trunkOpen) return tell('Сначала открой багажник · B.');
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
    if (state !== 'shift') return seated ? null : carPoint(-1.43, 0, -.4);
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
    controls.clear();
    updateControls();
    tell('R — завести двигатель. G — открыть ворота. E — выйти.');
  }

  const shutter = { x: 0, z: 7.95, w: 5.12, d: .25 };
  function hitsRectangle(x, z, radius, box) {
    return Math.hypot(Math.max(0,Math.abs(x-box.x)-box.w/2),
      Math.max(0,Math.abs(z-box.z)-box.d/2)) < radius;
  }
  function blocked(x, z, radius = .27) {
    if (district.obstacles.some(box => hitsRectangle(x,z,radius,box))) return true;
    if (door.position.y < 1.79 && hitsRectangle(x,z,radius,shutter)) return true;
    const forward = V(0,0,-1).applyQuaternion(physics.rotation);
    const yaw = Math.atan2(-forward.x,-forward.z);
    const dx = x-physics.position.x, dz = z-physics.position.z;
    const localX = dx*Math.cos(yaw)-dz*Math.sin(yaw);
    const localZ = dx*Math.sin(yaw)+dz*Math.cos(yaw);
    return hitsRectangle(localX,localZ,radius,{x:0,z:0,w:1.98,d:4.76});
  }

  function requestExit() {
    if (leaving) {
      leaving = false;
      tell('Выход отменён.', 1.4);
    } else if (physics.totalSpeed <= .12) {
      exitCar();
    } else {
      leaving = true;
      controls.clear();
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
    controls.clear();
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
    tell(hoodOpen ? 'Капот открыт' : 'Капот закрыт', 1.35);
  }

  function toggleTrunk() {
    if (physics.totalSpeed > .5) return tell('Остановись, чтобы открыть багажник.');
    if (!seated && !near(carPoint(0, 0, 2.36), 2.55)) return tell('Подойди к заднему бамперу · B.');
    trunkOpen = !trunkOpen;
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
    physics.reset();
    hoodOpen = hoodReleased = trunkOpen = lifted = leaving = false;
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
    if (state === 'menu' || seated) return;
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
  document.addEventListener('pointerlockchange', () => { mouseDown = false; controls.clear(); });
  window.addEventListener('blur', () => { controls.clear(); mouseDown = false; });
  document.addEventListener('visibilitychange', () => { controls.clear(); });

  document.addEventListener('keydown', event => {
    if (state === 'menu' || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof Element && event.target.matches('button,a,input')) return;
    if (/^(Key[WASDEBHRGCLT]|Arrow(Up|Down|Left|Right)|Space)$/.test(event.code)) event.preventDefault();
    controls.add(event.code);
    if (event.repeat || repairTime > 0) return;
    switch (event.code) {
      case 'KeyE': interaction()?.run(); break;
      case 'KeyR': toggleIgnition(); break;
      case 'KeyG': toggleGate(); break;
      case 'KeyH': toggleHood(); break;
      case 'KeyB': toggleTrunk(); break;
      case 'KeyL': toggleLift(); break;
      case 'KeyC': if (seated) { cockpit = !cockpit; cameraCut = true; } break;
      case 'KeyT': recover(); break;
    }
  });
  document.addEventListener('keyup', event => controls.delete(event.code));
  action.onclick = () => { action.blur(); interaction()?.run(); };
  $('#start').onclick = () => { $('#start').blur(); show('shift'); };
  $('#roam').onclick = () => { $('#roam').blur(); show('roam'); };
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
        audio = { context, engine, second, filter, volume };
      }
      audio.context.resume().catch(() => {});
    } catch { /* The game also plays without an audio device. */ }
  }

  function sound(now) {
    if (!audio) return;
    const { context, engine, second, filter, volume } = audio;
    const time = context.currentTime;
    const motor = physics.rpm / 30;
    const movingGate = Math.abs(door.position.y - (gateOpen ? 4.5 : 0)) > .08;
    const tool = now < repairSoundUntil;
    engine.frequency.setTargetAtTime(tool ? 95 : movingGate && !physics.running ? 43 : Math.max(22, motor), time, .055);
    second.frequency.setTargetAtTime(Math.max(30, motor * 2.01), time, .06);
    filter.frequency.setTargetAtTime(cockpit ? 290 : 470 + motor * 3, time, .1);
    const loudness = physics.running ? (seated ? .045 : .031 / (1 + player.distanceTo(car.position) * .15))
      : tool ? .026 : movingGate ? .02 : 0;
    volume.gain.setTargetAtTime(career.muted || state === 'menu' ? 0 : loudness, time, .08);
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
    if (repairTime > 0) {
      repairTime = Math.max(0, repairTime - STEP);
      if (repairTime === 0) {
        completePhase('repair');
        tell('Готово. Проверь результат.', 3.6);
      }
    }
    door.position.y = damp(door.position.y, gateOpen ? 4.5 : 0, 4.5, STEP);
    for (const slat of door.children) slat.visible = slat.position.y + door.position.y < 4.35;
    world.engine.visible = hood.rotation.x > .11;
    hood.rotation.x = damp(hood.rotation.x, hoodOpen ? 1.16 : hoodReleased ? .04 : 0, 8, STEP);
    trunk.rotation.x = damp(trunk.rotation.x, trunkOpen ? -1.03 : 0, 8, STEP);
    leftDoorTimer = Math.max(0, leftDoorTimer - STEP);
    for (const [side, door] of Object.entries(carDoors)) {
      door.rotation.y = damp(door.rotation.y, leftDoorTimer && side === doorSide ? (side === 'left' ? -.95 : .95) : 0, 10, STEP);
    }
    world.arms.position.y = damp(world.arms.position.y, lifted ? .86 : -.17, 6, STEP);
    const unsecured = hoodOpen || hoodReleased || trunkOpen || hood.rotation.x > .055 || trunk.rotation.x < -.055;
    if (seated && unsecured && key('KeyW','ArrowUp','KeyS','ArrowDown') && !leaving && noticeUntil < performance.now()) {
      tell('Перед выездом закрой капот и багажник.');
    }
    physics.tick({
      gas: seated && !unsecured && key('KeyW', 'ArrowUp'),
      reverse: seated && !unsecured && key('KeyS', 'ArrowDown'),
      turn: seated ? Number(key('KeyA', 'ArrowLeft')) - Number(key('KeyD', 'ArrowRight')) : 0,
      handbrake: seated && key('Space'),
      occupied: seated, parking: leaving || unsecured, fault: broken(), gateY: door.position.y,
    });
    if (leaving && physics.totalSpeed <= .12) exitCar();
    parked = insideBay() && physics.totalSpeed < .55;
    assessDrive();
    if (!seated && repairTime === 0) movePlayer(STEP);
  }

  // Shorten the chase offset when the camera would cross a wall.
  function safeChase(lookAt, desired) {
    let fraction = 1;
    const delta = desired.clone().sub(lookAt);
    const barriers = door.position.y < 3.6
      ? [...district.obstacles, { x: 0, z: 7.95, w: 5.18, d: .23, h: 4.35 }]
      : district.obstacles;
    for (const box of barriers) {
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
      const desired = transform(eye.set(.05, 2.63, 5.6 + Math.min(physics.totalSpeed * .035, .9)));
      const focus = transform(direction.set(0, 1.05, -.45));
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
    action.hidden = !prompt;
    if (prompt) action.lastElementChild.textContent = prompt.label;
    if (noticeUntil < now) notice.hidden = true;
    if (!onFoot) {
      speedText.textContent = Math.round(physics.totalSpeed * 3.6);
      gear.textContent = physics.speed < -.45 ? 'R' : physics.running ? 'D' : 'P';
      engineText.textContent = physics.running ? 'МОТОР ВКЛ' : 'МОТОР ВЫКЛ · R';
      rev.style.width = Math.min(100, physics.rpm / 52) + '%';
    }
    const p = position();
    const yaw = onFoot ? camera.rotation.y : new THREE.Euler().setFromQuaternion(car.quaternion, 'YXZ').y;
    mapPlayer.setAttribute('transform', `translate(${p.x.toFixed(2)} ${(-p.z).toFixed(2)}) rotate(${180 + THREE.MathUtils.radToDeg(yaw)})`);
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
    physics.render(car, wheels, accumulated / STEP, hubs);
    car.updateMatrixWorld(true);
    world.contact.position.set(car.position.x, .023, car.position.z);
    world.contact.visible = !lifted;
    for (const lamp of lampMeshes) lamp.visible = physics.braking;
    brakeLamps.emissiveIntensity = physics.braking ? 1.2 : 0;
    steering.rotation.z = -hubs[0].rotation.y * 4;
    const inWorkshop = position().z < 8.4 && position().z > -8.3 && Math.abs(position().x) < 7.3;
    workLight.castShadow = inWorkshop;
    district.sunlight.castShadow = !inWorkshop;
    district.sunlight.intensity = damp(district.sunlight.intensity, inWorkshop ? .55 : 2.05, 6, dt);
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
  $('#loading').textContent = '';
  $('#start').disabled = $('#roam').disabled = false;
  Object.defineProperty(window, 'garageLife', { value: Object.freeze({
    getState: () => ({
      mode: state, seated, cockpit, running: physics.running, speed: physics.speed * 3.6,
      car: physics.position.toArray(), player: player.toArray(), yaw: camera.rotation.y, gate: door.position.y, lifted,
      hood: hoodOpen, trunk: trunkOpen, leaving, phase: phase(), job: job().id, money: career.money, completed: career.completed,
      assets: { ...world.assetStatus }, render: { ...renderer.info.render }, graphics: career.high ? 'high' : 'standard',
    }),
  }) });
  requestAnimationFrame(frame);
}
