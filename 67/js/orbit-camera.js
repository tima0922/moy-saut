import { MathUtils } from 'three';

const { clamp, damp } = MathUtils;
const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));

export function createOrbitCamera() {
  let heading = 0;
  let yaw = 0;
  let pitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let lastMove = -Infinity;

  function center() {
    targetYaw = 0;
    targetPitch = 0;
    lastMove = -Infinity;
  }

  return {
    center,
    reset(base) {
      center();
      heading = base;
      yaw = pitch = 0;
    },
    move(dx, dy, now) {
      targetYaw = wrap(targetYaw - dx * .005);
      targetPitch = clamp(targetPitch + dy * .0035, -.42, .67);
      lastMove = now;
    },
    tick(base, dt, now, held) {
      heading += damp(0, wrap(base - heading), 6.5, dt);
      if (!held && now - lastMove > 1350) center();
      yaw += damp(0, wrap(targetYaw - yaw), 15, dt);
      pitch = damp(pitch, targetPitch, 13, dt);
      return { heading: heading + yaw, yaw, pitch };
    },
  };
}
