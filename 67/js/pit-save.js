const SAVE_KEY = 'garage-life-pit-1';

export const FLEET = {
  sedan: { code: 'E39', engine: 'S62 · V8 4.9', feel: 'Лёгкий вход в занос, плавная тяга', color: '#325783' },
  f90: { code: 'F90', engine: 'S63 · V8 4.4 Twin Turbo · 2WD', feel: 'Самая сильная тяга, цепкий передок', color: '#2469b3' },
  cls: { code: 'C219', engine: 'M156 · V8 6.2', feel: 'Плавнее перекладки, охотно срывает заднюю ось', color: '#a37a54' },
};

export const SETUPS = {
  power: { label: 'Мотор', options: ['Сток', 'Спорт'], values: [1, 1.18] },
  grip: { label: 'Задние шины', options: ['Уличные', 'Спорт'], values: [1, 1.16] },
  lock: { label: 'Выворот', options: ['Сток', 'Дрифт'], values: [1, 1.20] },
};

const range = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const fresh = id => ({ tires: 100, body: 100, brakes: 100, best: 0, color: FLEET[id].color, power: 0, grip: 0, lock: 0 });

export function loadPit(storage, legacyBest = 0) {
  let data;
  try { data = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null'); } catch { /* Start with a clean garage. */ }
  const cars = {};
  for (const id of Object.keys(FLEET)) {
    const car = fresh(id);
    const old = data?.cars?.[id];
    car.best = range(old?.best, 0, 1e8, id === 'sedan' ? legacyBest : 0);
    for (const part of ['tires', 'body', 'brakes']) car[part] = range(old?.[part], 0, 100, 100);
    if (typeof old?.color === 'string' && /^#[0-9a-f]{6}$/i.test(old.color)) car.color = old.color;
    for (const key of Object.keys(SETUPS)) car[key] = old?.[key] === 1 ? 1 : 0;
    cars[id] = car;
  }
  return { selected: Object.hasOwn(FLEET, data?.selected) ? data.selected : 'sedan', cars };
}

export function savePit(storage, pit) {
  try { storage?.setItem(SAVE_KEY, JSON.stringify(pit)); } catch { /* Storage can be disabled. */ }
}

export function setupFor(car) {
  return {
    power: SETUPS.power.values[car.power] * (.74 + .26 * car.body / 100),
    grip: SETUPS.grip.values[car.grip] * (.80 + .20 * car.tires / 100),
    lock: SETUPS.lock.values[car.lock],
    brakes: .63 + .37 * car.brakes / 100,
  };
}
