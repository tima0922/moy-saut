import * as THREE from 'three';
import RAPIER from '../vendor/rapier/rapier.mjs';

export const STEP = 1 / 60;
export const MODELS = {
  sedan: { name: 'BMW M5 E39', mass: 1795, length: 1, force: 7600, color: 0x273f62 },
  touring: { name: 'BMW M5 E39 · Sport', mass: 1795, length: 1, force: 8050, color: 0x596064 },
  f90: {
    name: 'BMW M5 F90', mass: 1930, length: 1.045, force: 10900, color: 0x225b9b,
    ratios: [5, 3.2, 2.14, 1.72, 1.31, 1, .82, .64], final: 3.15, redline: 7200,
    steer: .70, rearGrip: 1.20, frontGrip: 1.26, slide: .72, assist: .72, spring: 37, driveMultiplier: 1.06, traction: 1.17, yawDamping: .86,
  },
  cls: {
    name: 'Mercedes CLS 63 AMG', mass: 1905, length: 1.034, force: 9550, color: 0x6b5f54,
    ratios: [4.38, 2.86, 1.92, 1.37, 1, .82, .73], final: 2.82, redline: 6800,
    steer: .68, rearGrip: 1.10, frontGrip: 1.18, slide: .67, assist: .69, spring: 32, driveMultiplier: 1.01, traction: 1.075, yawDamping: 1.08,
  },
};

export const WHEEL_X = [-.77, -.77, .77, .77];
export const WHEEL_Z = [-1.52, 1.313, -1.52, 1.313];
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const defaultRatios = [4.23, 2.53, 1.67, 1.23, 1, .83];
const rest = .22;
const anchorY = .52;
const down = { x: 0, y: -1, z: 0 };
const axle = { x: 1, y: 0, z: 0 };
const stop = { x: 0, y: 0, z: 0 };

export async function createPhysics(obstacles, driftGround) {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = STEP;
  const ground = RAPIER.ColliderDesc.cuboid(54, .3, 67).setTranslation(0, -.3, 37);
  const floor = physics.createCollider(ground);
  const arenaFloor = driftGround && physics.createCollider(
    RAPIER.ColliderDesc.cuboid(driftGround.w / 2, .3, driftGround.d / 2)
      .setTranslation(driftGround.x, -.3, driftGround.z));
  const connectorFloor = driftGround && physics.createCollider(
    RAPIER.ColliderDesc.cuboid(6, .3, 9).setTranslation(0, -.3, 109));
  const events = new RAPIER.EventQueue(true);
  for (const { x, z, w, d, h } of obstacles) {
    physics.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, h / 2, z));
  }
  const gate = physics.createCollider(RAPIER.ColliderDesc.cuboid(2.56, 2.18, .13).setTranslation(0, 2.18, 7.95));
  const body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, .16, 0).setLinearDamping(.09).setAngularDamping(.8).setCcdEnabled(true).setCanSleep(false));
  let hull;
  let suspension;
  let model;
  let setup = {};
  let steer = 0;
  let rpm = 0;
  let running = false;
  let lifted = false;
  let speed = 0;
  let braking = false;
  let forwardBrake = false;
  let reverseBrake = false;
  let gear = 1;
  let shiftTime = 0;
  let slip = 0;
  let rearSlide = 0;
  let grounded = false;
  let hit = false;
  let up = 1;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const worldUp = new THREE.Vector3();
  const yawTorque = { x: 0, y: 0, z: 0 };
  const wheelSpin = [0, 0, 0, 0];
  const lastWheelRotation = [0, 0, 0, 0];
  const tireRight = new THREE.Vector3();
  const tireForward = new THREE.Vector3();
  const point = new THREE.Vector3();
  const impulse = new THREE.Vector3();

  function driftAxle(front, throttle, torque, service, handbrake, velocity) {
    const left = front ? 0 : 1;
    const wheelsDown = Number(suspension.wheelIsInContact(left)) + Number(suspension.wheelIsInContact(left + 2));
    if (!wheelsDown) return;

    const offset = -WHEEL_Z[left] * model.length;
    const angle = front ? steer : 0;
    tireRight.copy(right).multiplyScalar(Math.cos(angle)).addScaledVector(forward, -Math.sin(angle));
    tireForward.copy(forward).multiplyScalar(Math.cos(angle)).addScaledVector(right, Math.sin(angle));
    const yawRate = body.angvel().y;
    const vx = velocity.x - offset * yawRate * right.x;
    const vz = velocity.z - offset * yawRate * right.z;
    const longitudinal = vx * tireForward.x + vz * tireForward.z;
    const sideways = vx * tireRight.x + vz * tireRight.z;
    const slipAngle = Math.atan2(sideways, Math.max(2.8, Math.abs(longitudinal)));

    const load = model.mass * 9.81 * .5 * (wheelsDown / 2);
    const rearLocked = !front && handbrake;
    const brakeForce = service ? (front ? 8300 : 5500) * (setup.brakes ?? 1) : rearLocked ? 3600 : throttle === 0 ? 190 : 0;
    const driveForce = brakeForce
      ? -Math.sign(longitudinal) * Math.min(brakeForce, Math.abs(longitudinal) * model.mass * .5 / STEP)
      : front ? 0 : torque;
    const grip = load * (front ? (model.frontGrip ?? 1.22)
      : rearLocked ? .13 : ((model.rearGrip ?? 1.15) - rearSlide * (model.slide ?? .70)) * (setup.grip ?? 1));
    const tractionLimit = front || brakeForce ? load
      : load * (model.traction ?? 1) * (1 + ((setup.grip ?? 1) - 1) * .45);
    const traction = clamp(driveForce, -tractionLimit, tractionLimit);
    const remaining = Math.sqrt(Math.max(.10, 1 - (.68 * traction / tractionLimit) ** 2));
    const sideForce = -grip * remaining * Math.tanh(slipAngle * (front ? 7 : 5));
    const center = body.translation();
    point.set(center.x + offset * forward.x, center.y + .22, center.z + offset * forward.z);
    impulse.copy(tireRight).multiplyScalar(sideForce).addScaledVector(tireForward, traction).multiplyScalar(STEP);
    impulse.y = 0;
    body.applyImpulseAtPoint(impulse, point, true);
  }
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
    gear = 1;
    shiftTime = slip = rearSlide = 0;
    grounded = hit = false;
    up = 1;
    events.clear();
    wheelSpin.fill(0);
    for (let i = 0; i < wheelSpin.length; i++) lastWheelRotation[i] = suspension.wheelRotation(i) ?? 0;
    previousPose = currentPose = readPose();
  }

  function setModel(spec) {
    if (hull) physics.removeCollider(hull, true);
    if (suspension) physics.removeVehicleController(suspension);
    model = spec;
    setup = {};
    body.setAngularDamping(model.yawDamping ?? .8);
    hull = physics.createCollider(RAPIER.ColliderDesc.cuboid(.96, .31, 2.38 * model.length)
      .setTranslation(0, .70, 0).setMass(model.mass).setFriction(.45).setRestitution(.1)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(7200), body);
    suspension = physics.createVehicleController(body);
    suspension.indexUpAxis = 1;
    suspension.setIndexForwardAxis = 2;
    for (let i = 0; i < 4; i++) {
      suspension.addWheel({ x: WHEEL_X[i], y: anchorY, z: WHEEL_Z[i] * model.length }, down, axle, rest, .333);
      suspension.setWheelSuspensionStiffness(i, model.spring ?? 31);
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

  function tick({ gas = false, reverse = false, turn = 0, handbrake = false, occupied = false, parking = false, fault = '', gateY = 0, drift = false, speedLimit } = {}) {
    previousPose = currentPose;
    gate.setTranslation({ x: 0, y: gateY + 2.18, z: 7.95 });
    if (lifted) {
      physics.step();
      return;
    }

    const velocity = body.linvel();
    const total = Math.hypot(velocity.x, velocity.z);
    const kmh = total * 3.6;
    forwardBrake = reverse && (forwardBrake || speed > .55 || drift && total > 2 && speed > -.55);
    reverseBrake = gas && (reverseBrake || speed < -.55);
    braking = forwardBrake || reverseBrake || handbrake || parking;
    const moving = occupied && running && up > .15;
    const serviceBrake = forwardBrake || reverseBrake;
    // The handbrake locks the driven axle. Keep throttle input so releasing it restores torque immediately.
    const throttle = moving && !serviceBrake && !parking ? Number(gas) - Number(reverse) : 0;
    const wheelRpm = Math.abs(speed) * 60 / (2 * Math.PI * .333);
    shiftTime = Math.max(0, shiftTime - STEP);
    const ratios = model.ratios ?? defaultRatios;
    const final = model.final ?? 3.15;
    const redline = model.redline ?? 7000;
    const gearRpm = wheelRpm * ratios[gear - 1] * final;
    if (moving && speed > 0 && shiftTime === 0) {
      const upshift = gear < ratios.length && gearRpm > (gas ? redline - 200 : redline * .786);
      const downshift = gear > 1 && gearRpm < (gas ? 3100 : 2250);
      if (upshift || downshift) {
        gear += upshift ? 1 : -1;
        shiftTime = .24;
      }
    }
    const engineRpm = wheelRpm * (throttle < 0 ? 3.75 : ratios[gear - 1]) * final;
    const freeRev = gas && !serviceBrake ? (drift ? 2200 + rearSlide * 1900 : 1800) : 780;
    rpm = damp(rpm, running ? clamp(Math.max(freeRev, engineRpm), 780, redline) : 0, 9, STEP);

    const maxSpeed = throttle < 0 ? 22 : speedLimit ?? (drift ? 120 : 145);
    const drive = model.force * (setup.power ?? 1) * (drift ? model.driveMultiplier ?? 1.38 : 1) * Math.max(0, 1 - (kmh / maxSpeed) ** 2);
    const torque = handbrake ? 0 : drive * throttle * (throttle < 0 ? .46 : shiftTime > .10 ? .58 : 1);
    const slideSpeed = clamp((kmh - 12) / 15, 0, 1);
    const powerSlide = throttle > 0 ? clamp(Math.abs(turn) * .74 + Math.abs(slip) * 3.8, 0, 1) : 0;
    const slideTarget = drift && moving && grounded && speed > 1 ? slideSpeed * (handbrake ? 1 : powerSlide) : 0;
    rearSlide = damp(rearSlide, slideTarget, slideTarget > rearSlide ? 8 : throttle ? 3.6 : 7, STEP);
    const assist = drift && moving && grounded && speed > 3 && Math.abs(slip) > .10
      ? clamp(slip * (model.assist ?? .65), -.52, .52) * (1 - Math.abs(turn) * .64) : 0;
    const lock = drift ? (model.steer ?? .73) * (setup.lock ?? 1) / (1 + kmh * .009) : .53 / (1 + kmh * .019);
    steer = damp(steer, clamp(turn * lock + assist, -lock, lock), drift ? 9 : 8, STEP);
    const customTires = drift && moving && !parking;
    for (let i = 0; i < 4; i++) {
      const front = WHEEL_Z[i] < 0;
      const lowTire = fault === 'tires' && i === 0;
      suspension.setWheelSteering(i, front ? -steer + (lowTire && kmh > 6 ? .043 : 0) : 0);
      suspension.setWheelFrictionSlip(i, customTires ? 0 : handbrake && !front ? .55 : lowTire ? .77 : 1.32);
      suspension.setWheelSideFrictionStiffness(i, customTires ? 0 : lowTire ? .72 : 1.15);
      suspension.setWheelEngineForce(i, front || customTires ? 0 : torque / 2);
      const service = serviceBrake ? (setup.brakes ?? 1) * (fault === 'brakes' ? 14 : front ? 63 : 39) : 0;
      suspension.setWheelBrake(i, customTires ? 0 : !moving || parking ? 155 : handbrake && !front ? 155 : service || (throttle === 0 ? 2.1 : 0));
    }
    if (customTires && grounded) {
      driftAxle(true, throttle, torque, serviceBrake, handbrake, velocity);
      driftAxle(false, throttle, torque, serviceBrake, handbrake, velocity);
      // Damp excessive rotation once the driver countersteers or releases the gas.
      const stabilizing = !handbrake && (turn * slip > .07 || throttle <= 0 || Math.abs(turn) < .1);
      if (stabilizing && kmh > 18) {
        const strength = clamp((Math.abs(slip) - .17) * 4.8, 0, 3.6);
        yawTorque.y = -body.angvel().y * model.mass * 2 * strength * STEP;
        body.applyTorqueImpulse(yawTorque, true);
      }
    }
    if (fault === 'tires' && moving && kmh > 6 && suspension.wheelIsInContact(0)) {
      const drag = new THREE.Vector3(0, 0, Math.sign(speed) * Math.min(290, 35 * Math.abs(speed)));
      drag.applyQuaternion(currentPose.rotation);
      suspension.wheelContactPoint(0) && body.applyImpulseAtPoint(drag.multiplyScalar(STEP), suspension.wheelContactPoint(0), true);
    }
    suspension.updateVehicle(STEP, undefined, undefined, collider => collider.handle !== hull.handle);
    physics.step(events);
    for (let i = 0; i < wheelSpin.length; i++) {
      const rotation = suspension.wheelRotation(i) ?? 0;
      if (!drift || !handbrake || WHEEL_Z[i] < 0) wheelSpin[i] += rotation - lastWheelRotation[i];
      lastWheelRotation[i] = rotation;
    }
    hit = false;
    events.drainContactForceEvents(event => {
      const other = event.collider1() === hull.handle ? event.collider2() : event.collider1();
      if ((event.collider1() === hull.handle || event.collider2() === hull.handle) &&
          other !== floor.handle && other !== arenaFloor?.handle && other !== connectorFloor?.handle) hit = true;
    });
    currentPose = readPose();
    const nextVelocity = body.linvel();
    forward.set(0, 0, -1).applyQuaternion(currentPose.rotation);
    right.set(1, 0, 0).applyQuaternion(currentPose.rotation);
    up = worldUp.set(0, 1, 0).applyQuaternion(currentPose.rotation).y;
    speed = nextVelocity.x * forward.x + nextVelocity.z * forward.z;
    const lateral = nextVelocity.x * right.x + nextVelocity.z * right.z;
    slip = Math.atan2(lateral, Math.max(.01, speed));
    grounded = (suspension.wheelIsInContact(0) || suspension.wheelIsInContact(2)) &&
      (suspension.wheelIsInContact(1) || suspension.wheelIsInContact(3));
  }

  function render(root, wheels, alpha, hubs) {
    root.position.lerpVectors(previousPose.position, currentPose.position, alpha);
    root.quaternion.slerpQuaternions(previousPose.rotation, currentPose.rotation, alpha);
    for (let i = 0; i < wheels.length; i++) {
      const hub = hubs[i];
      hub.position.y = lifted ? .35 : anchorY - (suspension.wheelSuspensionLength(i) ?? rest);
      hub.rotation.y = suspension.wheelSteering(i) ?? 0;
      wheels[i].rotation.x = wheelSpin[i];
    }
  }

  setModel(MODELS.sedan);
  return {
    setModel, setLift, tick, reset, render,
    setSetup(values) { setup = values; },
    releasePedal(pedal) {
      if (pedal === 'brake') forwardBrake = false;
      if (pedal === 'gas') reverseBrake = false;
    },
    set running(value) { running = value && !lifted; },
    get running() { return running; },
    get speed() { return speed; },
    get rpm() { return rpm; },
    get braking() { return braking; },
    get gear() { return gear; },
    get slip() { return slip; },
    get grounded() { return grounded; },
    get hit() { return hit; },
    get up() { return up; },
    wheelContact(i) { return suspension.wheelIsInContact(i) ? suspension.wheelContactPoint(i) : null; },
    get position() { return currentPose.position; },
    get rotation() { return currentPose.rotation; },
    get totalSpeed() { const v = body.linvel(); return Math.hypot(v.x, v.z); },
  };
}
