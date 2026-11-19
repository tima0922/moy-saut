import { ENTRY_ANGLE, ENTRY_SPEED } from './drift-rules.js?v=037';

export const LESSONS = {
  entry: {
    title:'Вход в занос', route:'stadium', gate:0, time:15, target:.5,
    instruction:'Разгонись до {speed} км/ч, поверни и коротко нажми {brake}. Удержи занос полсекунды.',
    success:'Вход зачтён. Ты сорвал заднюю ось и поймал угол.',
  },
  hold: {
    title:'Удержание', route:'stadium', gate:0, time:20, target:2.2,
    instruction:'Войди в занос и держи угол 2,2 секунды. Поддерживай скорость газом, угол — контррулём.',
    success:'Дуга зачтена. Ты держал скорость и угол больше двух секунд.',
  },
  link: {
    title:'Перекладка', route:'stadium-s', gate:0, time:24, target:.33,
    instruction:'Пересеки оба створа в заносе. Между ними выпрями машину и задай угол в другую сторону.',
    success:'Связка зачтена. Ты прошёл две зоны со сменой направления.',
  },
};

export function lessonInstruction(id, brake) {
  return LESSONS[id].instruction.replace('{speed}', ENTRY_SPEED).replace('{brake}', brake);
}

export function createLessonAttempt(id) {
  const lesson = LESSONS[id];
  const state = { status:'ready', left:lesson.time, progress:0, streak:0, zones:0, feedback:'' };
  let lastDirection = 0, firstDirection = 0, streak = 0, cooldown = 0, offRoadTime = 0;
  let maxKmh = 0, hadAngle = false, lostThrottle = false, straightened = false, sameDirection = false;
  let previousSlip = 0;
  function finish(success, feedback) {
    state.status = success ? 'success' : 'retry';
    state.feedback = feedback;
    if (success) state.progress = 1;
  }

  return {
    state,
    tick(dt, { speed, slip, sliding, grounded, asphalt, hit, gas, gate }) {
      if (state.status === 'ready') {
        if (speed < 1.4) return;
        state.status = 'running';
      }
      if (state.status !== 'running') return;
      state.left = Math.max(0, state.left-dt);
      maxKmh = Math.max(maxKmh, speed * 3.6);
      const angle = Math.abs(slip) * 180 / Math.PI;
      const direction = Math.sign(slip);
      if (angle >= ENTRY_ANGLE && speed * 3.6 >= ENTRY_SPEED) hadAngle = true;
      if (hit) return finish(false, 'Был удар. В следующий заход начни занос дальше от отбойника.');
      offRoadTime = grounded && !asphalt ? offRoadTime+dt : 0;
      if (offRoadTime > .65) return finish(false, 'Выехал с асфальта. Попробуй войти в дугу раньше и с меньшей скоростью.');
      if (id === 'link' && firstDirection) cooldown += dt;

      if (sliding && grounded && asphalt) {
        streak = direction === lastDirection ? streak+dt : dt;
        lastDirection = direction;
        state.streak = Math.max(state.streak, streak);
      } else {
        if (streak > .20) {
          lostThrottle ||= !gas && speed * 3.6 < ENTRY_SPEED+4;
          straightened ||= angle < ENTRY_ANGLE && previousSlip >= ENTRY_ANGLE-1;
        }
        streak = 0;
      }
      previousSlip = angle;
      if (id === 'link') {
        if (gate === 0 && sliding && streak >= lesson.target) {
          firstDirection = direction;
          cooldown = 0;
          state.zones = 1;
        } else if (gate === 1 && firstDirection && sliding && streak >= lesson.target && cooldown > .2) {
          if (direction !== firstDirection) return finish(true, lesson.success);
          sameDirection = true;
        }
        state.progress = state.zones / 2;
      } else {
        state.progress = Math.min(1, state.streak/lesson.target);
        if (streak >= lesson.target) return finish(true, lesson.success);
      }
      if (state.left > 0) return;
      if (maxKmh < ENTRY_SPEED) return finish(false, `Не хватило скорости. Сначала набери хотя бы ${ENTRY_SPEED} км/ч.`);
      if (!hadAngle) return finish(false, 'Машина не встала боком. Поверни на скорости и коротко нажми ручник.');
      if (sameDirection) return finish(false, 'Вторая зона пройдена в ту же сторону. Перед ней смени направление заноса.');
      if (id === 'link') return finish(false, state.zones
        ? 'Первая зона зачтена. Во второй нужен устойчивый занос в обратную сторону.'
        : 'Первая зона не зачтена. Начни занос до зелёной метки и сохрани угол при пересечении.');
      if (lostThrottle) return finish(false, 'После сброса газа упала скорость. Поддержи тягу после входа.');
      if (straightened) return finish(false, 'Машина выпрямилась слишком рано. Мягче лови угол контррулём.');
      finish(false, 'Угол был, но занос получился коротким. Удержи его дольше и оставайся на асфальте.');
    },
  };
}
