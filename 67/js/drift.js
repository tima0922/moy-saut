import * as THREE from 'three';

export const ARENA = { x: 0, z: 171, w: 112, d: 112 };
export const CLUB_ARENA = { x: 0, z: 180, w: 178, d: 147 };
export const ROAD_HALF = 7.8;
export const RUN_TIME = 90;
export const ENTRY_SPEED = 22;
export const ENTRY_ANGLE = 11;
const EXIT_ANGLE = 72;
const { clamp, radToDeg } = THREE.MathUtils;

export function createLayout() {
  const controlPoints = [
    [-26, 135], [13, 135], [35, 144], [37, 161], [17, 174], [33, 190],
    [24, 206], [-3, 213], [-33, 205], [-43, 186], [-31, 168], [-43, 152],
  ];
  return makeLayout(controlPoints, 180, [23, 55, 81, 111, 140, 167, 0], ARENA);
}

export function createClubLayout() {
  // The long start straight leads into the outer bank, an infield S, and the north hairpin.
  const layout = makeLayout([
    [-38, 131], [-15, 129], [10, 129], [34, 132], [59, 142], [67, 160],
    [57, 179], [31, 186], [9, 169], [-12, 165], [-23, 181], [-9, 203],
    [16, 217], [10, 234], [-15, 236], [-51, 221], [-64, 197], [-53, 179],
    [-65, 157], [-57, 139],
  ], 256, [42, 71, 100, 134, 162, 195, 229, 0], CLUB_ARENA);
  // Inside apexes and outer exit clips alternate through the three sectors.
  for (const [i, offset] of [-5.65, 5.7, -5.65, 5.7, -5.65, 5.7, -5.65].entries()) {
    layout.gates[i].clip = { offset, width: 1.7 };
  }
  return layout;
}

export function createShortLayout(main) {
  const entry = 128, exit = 216;
  const connectorCurve = new THREE.CatmullRomCurve3([
    main.road[exit], new THREE.Vector3(-48,0,177), new THREE.Vector3(-39,0,175),
    new THREE.Vector3(-31,0,182), main.road[entry],
  ]);
  const connector = connectorCurve.getSpacedPoints(23);
  connector[0] = main.road[exit];
  connector[connector.length-1] = main.road[entry];
  const road = [...main.road.slice(entry,exit+1), ...connector.slice(1,-1)];
  const directions = road.map((_,i) => road[(i+1)%road.length].clone()
    .sub(road[(i+road.length-1)%road.length]).normalize());
  const gates = main.gates.filter(gate => road.includes(gate.position) && gate.position !== main.road[exit]);
  const i = exit-entry+11;
  gates.push({ position:road[i], direction:directions[i], clip:{ offset:5.55, width:1.7 } });
  const spawn = { x:road[0].x,z:road[0].z,yaw:Math.atan2(-directions[0].x,-directions[0].z) };
  return { road,directions,gates,spawn,connector,arena:main.arena,short:true };
}

export function safeCircuitStart(layout, position, other) {
  let best = Infinity, spawn;
  for (const [i, p] of layout.road.entries()) {
    const clearance = (p.x-other.x)**2 + (p.z-other.z)**2;
    if (clearance < 9**2) continue;
    const distance = (p.x-position.x)**2 + (p.z-position.z)**2;
    if (distance >= best) continue;
    const direction = layout.directions[i];
    spawn = { x:p.x,z:p.z,yaw:Math.atan2(-direction.x,-direction.z) };
    best = distance;
  }
  return spawn ?? layout.spawn;
}

function makeLayout(controlPoints, size, checkpoints, arena) {
  const curve = new THREE.CatmullRomCurve3(
    controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
  if (arena === CLUB_ARENA) curve.arcLengthDivisions = size * 8;
  const road = curve.getSpacedPoints(size).slice(0, size);
  const directions = road.map((p, i) => road[(i + 1) % size].clone().sub(road[(i + size - 1) % size]).normalize());
  const gates = checkpoints.map(index => ({
    position: road[index],
    direction: directions[index],
  }));
  const yaw = Math.atan2(-directions[0].x, -directions[0].z);
  return { road, directions, gates, arena, spawn: { x: road[0].x, z: road[0].z, yaw } };
}

function closestSegment(road, x, z) {
  let best = Infinity;
  let tangentX = 0;
  let tangentZ = 0;
  for (let i = 0; i < road.length; i++) {
    const a = road[i];
    const b = road[(i + 1) % road.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length2, 0, 1);
    const distance2 = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (distance2 >= best) continue;
    best = distance2;
    const length = Math.sqrt(length2);
    tangentX = dx / length;
    tangentZ = dz / length;
  }
  return { onRoad: best <= ROAD_HALF ** 2, tangentX, tangentZ };
}

export function createRun({ road, gates }, { startImmediately = false, duration = RUN_TIME,
  startGate = 0, free = false, pad = null } = {}) {
  const run = {
    status: startImmediately ? 'running' : 'ready', time: free ? null : duration, score: 0, chain: 0, multiplier: 1,
    next: startGate, lap: 0, clips: 0, angle: 0, warning: '', sliding: false, events: [],
  };
  let lastPosition;
  let calmTime = 0;
  let chainTime = 0;
  let penaltyTime = 0;

  let eventId = 0;
  function report(kind, message, points = 0) {
    run.events.push({ id: ++eventId, kind, message, points });
    if (run.events.length > 5) run.events.shift();
  }

  function endChain(bank, reason) {
    const amount = Math.floor(run.chain);
    if (bank && chainTime >= .28 && amount) {
      run.score += amount;
      report('bank', reason ? reason + ' · серия засчитана' : 'Серия засчитана', amount);
    } else if (amount && reason) {
      report('loss', reason + ' · серия потеряна', amount);
    }
    run.chain = chainTime = calmTime = 0;
    run.multiplier = 1;
  }

  function finish(bank = true) {
    if (run.status === 'finished') return;
    endChain(bank && !penaltyTime);
    run.sliding = false;
    run.status = 'finished';
  }

  return {
    run, finish,
    start() { if (run.status === 'ready') run.status = 'running'; },
    recover() {
      endChain(false,'Возврат на трассу');
      run.sliding = false;
      run.angle = 0;
      run.warning = '';
      lastPosition = undefined;
      penaltyTime = 0;
    },
    tick(dt, { position, speed, slip, grounded, hit, up }) {
      const { x, z } = position;
      const angle = Math.abs(radToDeg(slip));
      const kmh = speed * 3.6;
      run.angle = kmh > 5 ? angle : 0;
      if (run.status === 'finished') return;
      if (run.status === 'ready') {
        if (kmh < 5) return;
        run.status = 'running';
      }
      if (!free) run.time = Math.max(0, run.time - dt);
      const { onRoad, tangentX, tangentZ } = pad ? {
        onRoad: Math.abs(x-pad.x) < pad.w/2-.8 && Math.abs(z-pad.z) < pad.d/2-.8, tangentX:0,tangentZ:0,
      } : closestSegment(road,x,z);
      const dx = lastPosition ? x - lastPosition.x : 0;
      const dz = lastPosition ? z - lastPosition.z : 0;
      lastPosition = { x, z };
      const distance = Math.hypot(dx, dz);
      const progress = dx * tangentX + dz * tangentZ;
      const error = hit ? 'Удар' : up < .5 ? 'Переворот' : !onRoad ? 'За разметкой'
        : angle > EXIT_ANGLE && kmh > 14 ? 'Разворот' : '';
      if (error) {
        run.warning = error;
        penaltyTime = .75;
        endChain(false,error);
      } else {
        penaltyTime = Math.max(0, penaltyTime - dt);
        if (!penaltyTime) run.warning = '';
      }

      run.sliding = !penaltyTime && grounded && kmh >= ENTRY_SPEED && angle >= ENTRY_ANGLE &&
        angle < EXIT_ANGLE && (pad ? distance > .001 : progress > distance*.44);
      if (run.sliding) {
        calmTime = 0;
        chainTime += dt;
        run.multiplier = Math.min(4, 1 + Math.floor(chainTime / 1.6));
        const quality = clamp((angle - 7) / 30, .17, 1);
        run.chain += (8 + Math.min(90, kmh) * .72) * quality * dt * run.multiplier;
      } else if (run.chain && (calmTime += dt) >= .58) {
        endChain(true,angle < ENTRY_ANGLE ? 'Выпрямление' : 'Потеря темпа');
      }

      const gate = gates[run.next];
      const rx = x - gate.position.x;
      const rz = z - gate.position.z;
      const along = rx * gate.direction.x + rz * gate.direction.z;
      const advance = dx * gate.direction.x + dz * gate.direction.z;
      if (!pad && onRoad && grounded && !penaltyTime && advance > 0 && along >= 0 && along < advance) {
        // Use the exact point where the trajectory crossed the timing line.
        const fraction = along / advance;
        const across = (rx - dx*fraction)*gate.direction.z - (rz - dz*fraction)*gate.direction.x;
        if (Math.abs(across) < ROAD_HALF) {
          if (gate.clip && run.sliding && Math.abs(across - gate.clip.offset) <= gate.clip.width) {
            run.clips++;
            const points = 65*run.multiplier;
            run.chain += points;
            report('clip', `Клип ${run.next+1} · в серию`, points);
          }
          else if (gate.clip) report('miss',`Клип ${run.next+1} пропущен`);
          run.next = (run.next+1)%gates.length;
          if (!run.next) run.lap++;
        }
      }
      if (!free && !run.time) finish();
    },
  };
}
