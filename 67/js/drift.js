import * as THREE from 'three';

export const ARENA = { x: 0, z: 171, w: 112, d: 112 };
export const ROAD_HALF = 7.8;
export const RUN_TIME = 90;
export const ENTRY_SPEED = 22;
export const ENTRY_ANGLE = 11;
const EXIT_ANGLE = 72;
export const PIT_MERGE = 130;
export const PIT_EXIT = 119;
export const PIT_LANE_HALF = 4.7;
const { clamp, radToDeg } = THREE.MathUtils;

export function createLayout() {
  const controlPoints = [
    [-26, 135], [13, 135], [35, 144], [37, 161], [17, 174], [33, 190],
    [24, 206], [-3, 213], [-33, 205], [-43, 186], [-31, 168], [-43, 152],
  ];
  const curve = new THREE.CatmullRomCurve3(
    controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
  const size = 180;
  const road = curve.getSpacedPoints(size).slice(0, size);
  const directions = road.map((p, i) => road[(i + 1) % size].clone().sub(road[(i + size - 1) % size]).normalize());
  const gates = [23, 55, 81, 111, 140, 167, 0].map(index => ({
    position: road[index],
    direction: directions[index],
  }));
  const yaw = Math.atan2(-directions[0].x, -directions[0].z);
  return { road, directions, gates, spawn: { x: road[0].x, z: road[0].z, yaw } };
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

export function createRun({ road, gates }, { startImmediately = false } = {}) {
  const run = {
    status: startImmediately ? 'running' : 'ready', time: RUN_TIME, score: 0, chain: 0, multiplier: 1,
    next: 0, lap: 0, angle: 0, warning: '', sliding: false,
  };
  let lastPosition;
  let calmTime = 0;
  let chainTime = 0;
  let penaltyTime = 0;

  function endChain(bank) {
    if (bank && chainTime >= .28) run.score += Math.floor(run.chain);
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
      run.time = Math.max(0, run.time - dt);
      const { onRoad, tangentX, tangentZ } = closestSegment(road, x, z);
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
        endChain(false);
      } else {
        penaltyTime = Math.max(0, penaltyTime - dt);
        if (!penaltyTime) run.warning = '';
      }

      run.sliding = !penaltyTime && grounded && kmh >= ENTRY_SPEED && angle >= ENTRY_ANGLE &&
        angle < EXIT_ANGLE && progress > distance * .44;
      if (run.sliding) {
        calmTime = 0;
        chainTime += dt;
        run.multiplier = Math.min(4, 1 + Math.floor(chainTime / 1.6));
        const quality = clamp((angle - 7) / 30, .17, 1);
        run.chain += (8 + Math.min(90, kmh) * .72) * quality * dt * run.multiplier;
      } else if (run.chain && (calmTime += dt) >= .58) {
        endChain(true);
      }

      const gate = gates[run.next];
      const rx = x - gate.position.x;
      const rz = z - gate.position.z;
      const along = rx * gate.direction.x + rz * gate.direction.z;
      const advance = dx * gate.direction.x + dz * gate.direction.z;
      const across = rx * gate.direction.z - rz * gate.direction.x;
      if (onRoad && grounded && !penaltyTime && advance > 0 && along >= 0 && along < advance && Math.abs(across) < ROAD_HALF) {
        run.next = (run.next + 1) % gates.length;
        if (!run.next) run.lap++;
      }
      if (!run.time) finish();
    },
  };
}
