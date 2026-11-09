export const JOBS = [
  {
    id: 'brakes', car: 'sedan', title: 'Длинный тормозной путь',
    complaint: '«На перекрёстке еле остановился. Педаль в полу, а машина ещё едет».',
    reading: 'Передние колодки · 2 мм. Остаток ниже нормы.',
    part: 'Передние колодки', repair: 'Установить колодки', pay: 520,
    test: 'На тест-полосе разгонись до 32 км/ч и нажми S. Остановись до финиша.',
  },
  {
    id: 'tires', car: 'touring', title: 'Тянет влево',
    complaint: '«На прямой приходится всё время подруливать вправо».',
    reading: 'Переднее левое · 1,1 бар. Остальные · 2,3 бар.',
    part: '', repair: 'Накачать колесо до 2,3 бар', pay: 340,
    test: 'На тест-полосе держи 25 км/ч или выше и проедь 18 м по прямой.',
  },
  {
    id: 'battery', car: 'sedan', title: 'Тишина под капотом',
    complaint: '«Повернул ключ, стартер даже не прокрутился».',
    reading: 'Аккумулятор · 10,1 В. Заряд не держится.',
    part: 'Аккумулятор 12 В', repair: 'Заменить аккумулятор', pay: 440,
    test: 'Закрой багажник, сядь за руль и нажми R. Дай мотору поработать 2 секунды.',
  },
];

const KEY = 'garage-life-district-1';
const PHASES = ['offer', 'diagnose', 'parts', 'repair', 'verify', 'return'];

export function loadCareer(storage) {
  const fresh = { completed: 0, money: 0, scanner: false, phase: 'offer', high: true, muted: false, driftBest: 0 };
  try {
    const value = JSON.parse(storage.getItem(KEY));
    if (!value || !Number.isSafeInteger(value.completed) || value.completed < 0 ||
      !Number.isSafeInteger(value.money) || value.money < 0 || !PHASES.includes(value.phase)) return fresh;
    return { ...fresh, ...value, driftBest: Number.isSafeInteger(value.driftBest) && value.driftBest > 0 ? value.driftBest : 0 };
  } catch {
    return fresh;
  }
}

export function saveCareer(storage, career) {
  try { storage.setItem(KEY, JSON.stringify(career)); } catch { /* Private storage can be unavailable. */ }
}

export function advance(career, phase) {
  const job = JOBS[career.completed % JOBS.length];
  if (career.phase !== phase) return false;
  const next = {
    offer: 'diagnose',
    diagnose: job.part ? 'parts' : 'repair',
    parts: 'repair',
    repair: 'verify',
    verify: 'return',
    return: 'offer',
  };
  career.phase = next[phase];
  if (phase === 'return') {
    career.completed++;
    career.money += job.pay;
  }
  return true;
}

export function makeRoadTest(job, track) {
  let run = null;
  return ({ x, z, speed, heading, service, totalSpeed }) => {
    const inside = Math.abs(x - track.x) < 2.5 && z >= track.start - 1 && z <= track.end + .5 && heading > .88;
    if (!inside) {
      run = null;
      return null;
    }
    if (job === 'brakes') {
      if (!run && service && speed >= 32) run = { speed, distance: 0, lastX: x, lastZ: z };
      if (!run) return null;
      run.distance += Math.hypot(x - run.lastX, z - run.lastZ);
      run.lastX = x;
      run.lastZ = z;
      if (totalSpeed < .5) {
        const result = { pass: run.distance <= (run.speed / 3.6) ** 2 / 9 + 1.2, value: run.distance };
        run = null;
        return result;
      }
      if (!service) run = null;
    } else if (job === 'tires') {
      if (speed < 25) {
        run = null;
        return null;
      }
      run ??= { x, z };
      if (z - run.z >= 18) {
        const drift = Math.abs(run.x - x);
        run = null;
        return { pass: drift < 1.5, value: drift };
      }
    }
    return null;
  };
}
