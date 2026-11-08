import * as THREE from 'three';
import RAPIER from '../vendor/rapier/rapier.mjs';

export const STEP = 1 / 60;
export const MODELS = {
  sedan: { name: 'BMW M5 E39', mass: 1795, length: 1, force: 7600, color: 0x273f62 },
  touring: { name: 'BMW M5 E39 · Sport', mass: 1795, length: 1, force: 8050, color: 0x596064 },
};

export const WHEEL_X = [-.77, -.77, .77, .77];
export const WHEEL_Z = [-1.52, 1.313, -1.52, 1.313];
const rest = .22;
const anchorY = .52;
const down = { x: 0, y: -1, z: 0 };
const axle = { x: 1, y: 0, z: 0 };
const stop = { x: 0, y: 0, z: 0 };

export async function createPhysics(obstacles) {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = STEP;
  const ground = RAPIER.ColliderDesc.cuboid(54, .3, 67).setTranslation(0, -.3, 37);
  physics.createCollider(ground);
  for (const { x, z, w, d, h } of obstacles) {
    physics.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, h / 2, z));
  }
  const gate = physics.createCollider(RAPIER.ColliderDesc.cuboid(2.56, 2.18, .13).setTranslation(0, 2.18, 7.95));
  const body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, .16, 0).setLinearDamping(.09).setAngularDamping(.8).setCcdEnabled(true).setCanSleep(false));
  let hull;
  let suspension;
  let model;
  let steer = 0;
  let rpm = 0;
  let running = false;
  let lifted = false;
  let speed = 0;
  let braking = false;
  let forwardBrake = false;
  let reverseBrake = false;
  let previousPose;
  let currentPose;

  function readPose() {
    const position = body.translation();
    const rotation = body.rotation();
    return {
      position: new THREE.Vector3(position.x, position.y, position.z),
      rotation: new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    };
  }

  function reset(x = 0, z = 0, yaw = Math.PI) {
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.setTranslation({ x, y: .15, z }, true);
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    body.setLinvel(stop, true);
    body.setAngvel(stop, true);
    lifted = false;
    running = false;
    speed = 0;
    braking = forwardBrake = reverseBrake = false;
    steer = 0;
    rpm = 0;
    previousPose = currentPose = readPose();
  }

  function setModel(spec) {
    if (hull) physics.removeCollider(hull, true);
    if (suspension) physics.removeVehicleController(suspension);
    model = spec;
    hull = physics.createCollider(RAPIER.ColliderDesc.cuboid(.96, .31, 2.38 * model.length)
      .setTranslation(0, .73, 0).setMass(model.mass).setFriction(.6), body);
    suspension = physics.createVehicleController(body);
    suspension.indexUpAxis = 1;
    suspension.setIndexForwardAxis = 2;
    for (let i = 0; i < 4; i++) {
      suspension.addWheel({ x: WHEEL_X[i], y: anchorY, z: WHEEL_Z[i] * model.length }, down, axle, rest, .333);
      suspension.setWheelSuspensionStiffness(i, 31);
      suspension.setWheelSuspensionCompression(i, 4.4);
      suspension.setWheelSuspensionRelaxation(i, 4.9);
      suspension.setWheelMaxSuspensionTravel(i, .23);
      suspension.setWheelMaxSuspensionForce(i, 11000);
      suspension.setWheelSideFrictionStiffness(i, 1.15);
      suspension.setWheelFrictionSlip(i, 1.32);
    }
    reset();
  }

  function setLift(height) {
    if (height > 0) {
      running = false;
      lifted = true;
      body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      body.setTranslation({ x: body.translation().x, y: height, z: body.translation().z }, true);
      previousPose = currentPose = readPose();
    } else {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      lifted = false;
    }
  }

  function tick({ gas = false, reverse = false, turn = 0, handbrake = false, occupied = false, parking = false, fault = '', gateY = 0 } = {}) {
    previousPose = currentPose;
    gate.setTranslation({ x: 0, y: gateY + 2.18, z: 7.95 });
    if (lifted) {
      physics.step();
      return;
    }

    const kmh = Math.abs(speed) * 3.6;
    forwardBrake = reverse && (forwardBrake || speed > .55);
    reverseBrake = gas && (reverseBrake || speed < -.55);
    braking = forwardBrake || reverseBrake || handbrake || parking;
    const moving = occupied && running;
    const throttle = moving && !braking ? Number(gas) - Number(reverse) : 0;
    const maxSpeed = throttle < 0 ? 22 : 145;
    const torque = model.force * Math.max(0, 1 - (kmh / maxSpeed) ** 2) * throttle * (throttle < 0 ? .46 : 1);
    steer = THREE.MathUtils.damp(steer, turn * (.53 / (1 + kmh * .019)), 8, STEP);
    for (let i = 0; i < 4; i++) {
      const front = WHEEL_Z[i] < 0;
      const lowTire = fault === 'tires' && i === 0;
      suspension.setWheelSteering(i, front ? -steer + (lowTire && kmh > 6 ? -.043 : 0) : 0);
      suspension.setWheelFrictionSlip(i, handbrake && !front ? .55 : lowTire ? .77 : 1.32);
      suspension.setWheelSideFrictionStiffness(i, lowTire ? .72 : 1.15);
      suspension.setWheelEngineForce(i, front ? 0 : torque / 2);
      const service = (forwardBrake || reverseBrake) ? (fault === 'brakes' ? 14 : front ? 63 : 39) : 0;
      suspension.setWheelBrake(i, !moving || parking ? 155 : handbrake && !front ? 155 : service || (throttle === 0 ? 2.1 : 0));
    }
    if (fault === 'tires' && moving && kmh > 6 && suspension.wheelIsInContact(0)) {
      const drag = new THREE.Vector3(0, 0, Math.sign(speed) * Math.min(290, 35 * Math.abs(speed)));
      drag.applyQuaternion(currentPose.rotation);
      suspension.wheelContactPoint(0) && body.applyImpulseAtPoint(drag.multiplyScalar(STEP), suspension.wheelContactPoint(0), true);
    }
    suspension.updateVehicle(STEP, undefined, undefined, collider => collider.handle !== hull.handle);
    physics.step();
    currentPose = readPose();
    const velocity = body.linvel();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentPose.rotation);
    speed = velocity.x * forward.x + velocity.z * forward.z;
    rpm = THREE.MathUtils.damp(rpm, running ? 870 + (kmh % 31) * 82 + Math.abs(throttle) * 1250 : 0, 7, STEP);
  }

  function render(root, wheels, alpha, hubs) {
    root.position.lerpVectors(previousPose.position, currentPose.position, alpha);
    root.quaternion.slerpQuaternions(previousPose.rotation, currentPose.rotation, alpha);
    for (let i = 0; i < wheels.length; i++) {
      const hub = hubs[i];
      hub.position.y = lifted ? .35 : anchorY - (suspension.wheelSuspensionLength(i) ?? rest);
      hub.rotation.y = suspension.wheelSteering(i) ?? 0;
      wheels[i].rotation.x = suspension.wheelRotation(i) ?? 0;
    }
  }

  setModel(MODELS.sedan);
  return {
    setModel, setLift, tick, reset, render,
    set running(value) { running = value && !lifted; },
    get running() { return running; },
    get speed() { return speed; },
    get rpm() { return rpm; },
    get braking() { return braking; },
    get position() { return currentPose.position; },
    get rotation() { return currentPose.rotation; },
    get totalSpeed() { const v = body.linvel(); return Math.hypot(v.x, v.z); },
  };
}
