import * as THREE from 'three';
import RAPIER from '../vendor/rapier/rapier.mjs';

export const STEP = 1 / 60;
export const MODELS = {
  sedan: { name: 'BMW M5 E39', mass: 1795, length: 1, force: 7600, color: 0x273f62 },
  touring: { name: 'BMW M5 E39 · Sport', mass: 1795, length: 1, force: 8050, color: 0x596064 },
  f90: {
    name: 'BMW M5 F90', mass: 1930, length: 1.045, force: 10900, color: 0x225b9b,
    ratios: [5, 3.2, 2.14, 1.72, 1.31, 1, .82, .64], final: 3.15, redline: 7200,
    steer: .70, rearGrip: 1.20, frontGrip: 1.26, slide: .72, assist: .72, response: 16, spring: 37, driveMultiplier: 1.06, traction: 1.17, yawDamping: .86,
  },
  cls: {
    name: 'Mercedes CLS 63 AMG', mass: 1905, length: 1.034, force: 9550, color: 0x6b5f54,
    ratios: [4.38, 2.86, 1.92, 1.37, 1, .82, .73], final: 2.82, redline: 6800,
    steer: .68, rearGrip: 1.10, frontGrip: 1.18, slide: .67, assist: .69, response: 14.5, spring: 32, driveMultiplier: 1.01, traction: 1.075, yawDamping: 1.08,
  },
  supra: {
    name:'Toyota Supra Mk4', mass:1515, length:.91, force:8450, color:0xf46c13,
    ratios:[3.83,2.36,1.69,1.31,1,.79], final:3.27, redline:7400,
    steer:.77,rearGrip:1.09,frontGrip:1.25,slide:.67,assist:.72,response:18,
    spring:32,driveMultiplier:1.08,traction:1.08,yawDamping:.94,
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
const HULL_GROUP = 2;
const STATIC_GROUP = 1;

export async function createPhysics(obstacles, driftGround, garageGround, terrain, practiceGround) {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = STEP;
  const ground = RAPIER.ColliderDesc.cuboid(54, .3, 67).setTranslation(0, -.3, 37);
  const floor = physics.createCollider(ground);
  const arenaFloor = driftGround && physics.createCollider(
    terrain ? RAPIER.ColliderDesc.trimesh(terrain.vertices, terrain.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES) : RAPIER.ColliderDesc.cuboid(driftGround.w / 2, .3, driftGround.d / 2)
      .setTranslation(driftGround.x, -.3, driftGround.z));
  const garageFloor = garageGround && physics.createCollider(
    RAPIER.ColliderDesc.cuboid(garageGround.w / 2, .3, garageGround.d / 2)
      .setTranslation(garageGround.x, -.3, garageGround.z));
  const connectorFloor = driftGround && !garageGround && physics.createCollider(
    RAPIER.ColliderDesc.cuboid(6, .3, 9).setTranslation(0, -.3, 109));
  const practiceFloor = practiceGround && physics.createCollider(
    RAPIER.ColliderDesc.cuboid(practiceGround.w/2,.3,practiceGround.d/2)
      .setTranslation(practiceGround.x,-.3,practiceGround.z));
  const inArena = (x,z) => !!terrain && Math.abs(x-driftGround.x)<driftGround.w/2 &&
    Math.abs(z-driftGround.z)<driftGround.d/2;
  const events = new RAPIER.EventQueue(true);
  for (const { x, z, w, d, h, y = 0 } of obstacles) {
    physics.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z));
  }
  const gate = physics.createCollider(RAPIER.ColliderDesc.cuboid(2.56, 2.18, .13).setTranslation(0, 2.18, 7.95));
  const cars = new Set();
  const impacts = new Set();
  const hullHandles = new Set();
  let carContacts = true;
  const hullGroups = () => (HULL_GROUP << 16) | STATIC_GROUP | (carContacts ? HULL_GROUP : 0);
  const groundHandles = new Set([floor, arenaFloor, garageFloor, connectorFloor, practiceFloor].filter(Boolean).map(item => item.handle));

  function createCar() {
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, .16, 0).setLinearDamping(.09).setAngularDamping(.8).setCcdEnabled(true).setCanSleep(false));
    let hull;
    let suspension;
    let model;
    let setup = {};
    let assistMode = 'guided';
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
    let handbrakeTime = 0;
    let brakeRelease = 0;
    let loadTransfer = 0;
    let lastLongitudinal = 0;
    let linkTime = 0;
    let linkTurn = 0;
    let handbrakePressed = false;
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
    const contactNormal = new THREE.Vector3();

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

      const contact = suspension.wheelContactPoint(left) ?? suspension.wheelContactPoint(left+2);
      const surface = contact && inArena(contact.x,contact.z) ? terrain.gripAt(contact.x,contact.z) : 1;
      const load = surface * model.mass * 9.81 * (.5 + (front ? loadTransfer : -loadTransfer)) * (wheelsDown / 2);
      const rearLocked = !front && handbrake;
      const brakeForce = service ? (front ? 8300 : 5500) * (setup.brakes ?? 1) : rearLocked ? 2750 : throttle === 0 ? 190 : 0;
      const driveForce = brakeForce
        ? -Math.sign(longitudinal) * Math.min(brakeForce, Math.abs(longitudinal) * model.mass * .5 / STEP)
        : front ? 0 : torque;
      const pressureGrip = 1 - ((setup.pressure ?? 2.4) - 2.4) * .18;
      const grip = load * (front ? (model.frontGrip ?? 1.22)
        : THREE.MathUtils.lerp(((model.rearGrip ?? 1.15) - rearSlide * (model.slide ?? .70)) * (setup.grip ?? 1) * pressureGrip, .075, brakeRelease));
      const tractionLimit = front || brakeForce ? load
        : load * (model.traction ?? 1) * (1 + ((setup.grip ?? 1) - 1) * .45);
      const traction = clamp(driveForce, -tractionLimit, tractionLimit);
      const remaining = Math.sqrt(Math.max(.10, 1 - (.68 * traction / tractionLimit) ** 2));
      const sideForce = -grip * remaining * Math.tanh(slipAngle * (front ? 7 : 5));
      const center = body.translation();
      point.set(center.x + offset * forward.x, center.y + (terrain ? offset * forward.y : 0) + .22, center.z + offset * forward.z);
      impulse.copy(tireRight).multiplyScalar(sideForce).addScaledVector(tireForward, traction).multiplyScalar(STEP);
      if (terrain) {
        contactNormal.set(0,0,0);
        for (const i of [left,left+2]) {
          const normal = suspension.wheelIsInContact(i) && suspension.wheelContactNormal(i);
          if (normal) {
            contactNormal.x += normal.x;
            contactNormal.y += normal.y;
            contactNormal.z += normal.z;
          }
        }
        contactNormal.normalize();
        impulse.addScaledVector(contactNormal,-impulse.dot(contactNormal));
      } else impulse.y = 0;
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
      const onArena = inArena(x,z);
      body.setTranslation({ x, y: .15 + (onArena ? terrain.heightAt(x,z) : 0), z }, true);
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
      shiftTime = slip = rearSlide = handbrakeTime = 0;
      brakeRelease = loadTransfer = lastLongitudinal = 0;
      linkTime = linkTurn = 0;
      grounded = hit = handbrakePressed = false;
      up = 1;
      events.clear();
      wheelSpin.fill(0);
      for (let i = 0; i < wheelSpin.length; i++) lastWheelRotation[i] = suspension.wheelRotation(i) ?? 0;
      previousPose = currentPose = readPose();
    }

    function setModel(spec) {
      if (hull) {
        hullHandles.delete(hull.handle);
        physics.removeCollider(hull,true);
      }
      if (suspension) physics.removeVehicleController(suspension);
      model = spec;
      setup = {};
      body.setAngularDamping(model.yawDamping ?? .8);
      hull = physics.createCollider(RAPIER.ColliderDesc.cuboid(.96, .31, 2.38 * model.length)
        .setTranslation(0, .70, 0).setMass(model.mass).setFriction(.45).setRestitution(.025)
        .setCollisionGroups(hullGroups())
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(7200), body);
      hullHandles.add(hull.handle);
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

    function prepare({ gas = false, reverse = false, turn = 0, handbrake = false, occupied = false, parking = false, fault = '', gateY = 0, drift = false, speedLimit } = {}) {
      previousPose = currentPose;
      if (lifted) return;

      const velocity = body.linvel();
      const total = Math.hypot(velocity.x, velocity.z);
      const kmh = total * 3.6;
      // A quick key tap needs a short lock to register with digital steering.
      if (!handbrakePressed && handbrake && drift && kmh > 18 && grounded && Math.abs(turn) > .12) {
        handbrakeTime = .21;
      } else {
        handbrakeTime = Math.max(0, handbrakeTime - STEP);
      }
      handbrakePressed = handbrake;
      const tapLock = handbrakeTime > 0 && !handbrake;
      handbrake = handbrake || tapLock;
      brakeRelease = damp(brakeRelease, handbrake ? 1 : 0, handbrake ? 47 : 20, STEP);
      // Longitudinal acceleration transfers grip between the two axles.
      const acceleration = clamp((speed - lastLongitudinal) / STEP, -11, 8);
      lastLongitudinal = speed;
      loadTransfer = damp(loadTransfer, -acceleration * .012, 9, STEP);
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
      const torque = (handbrake ? 0 : drive * throttle * (drift ? 1 - brakeRelease : 1)) * (throttle < 0 ? .46 : shiftTime > .10 ? .58 : 1);
      const slideSpeed = clamp((kmh - 12) / 14, 0, 1);
      const slipDemand = clamp((Math.abs(slip) - .055) * 3.4, 0, 1);
      const diffEffect = 1 + ((setup.diff ?? .8) - .8) * .70;
      if (!drift || throttle <= 0 || turn*linkTurn < .75 || !grounded) linkTime = 0;
      if (!linkTime && drift && setup.steerAngle && throttle > 0 && grounded && kmh > 27 && turn*steer < -.12 && Math.abs(slip) > .17) {
        linkTime = 1.20;
        linkTurn = Math.sign(turn);
      }
      // A held opposite input keeps the rear loose as the body passes through alignment.
      const link = linkTime > 0 ? clamp((.24-turn*slip)*6,0,1)*.82 : 0;
      linkTime = Math.max(0,linkTime-STEP);
      const powerSlide = throttle > 0 ? clamp(Math.max(link,Math.abs(steer) * 1.12 + slipDemand) * diffEffect, 0, 1) : 0;
      const slideTarget = drift && moving && grounded && speed > 1 ? slideSpeed * (handbrake ? 1 : powerSlide) : 0;
      rearSlide = damp(rearSlide, slideTarget, slideTarget > rearSlide ? (handbrake ? 21 : 10) : throttle ? 3.6 : 7, STEP);
      const modelLock = model.steer ?? .73;
      const maxLock = setup.steerAngle ? THREE.MathUtils.lerp(THREE.MathUtils.degToRad(setup.steerAngle),
        modelLock * (1+(setup.steerAngle-52)*.011), THREE.MathUtils.smoothstep(kmh,5,26)) : modelLock;
      const lock = drift ? maxLock / (1 + kmh * .009) : .53 / (1 + kmh * .019);
      // Blend small countersteer corrections continuously. Full opposite input
      // remains available for transitions; the assist never steers for the driver.
      const assistWeight = drift && moving && grounded && speed > 3 && !handbrake
        ? THREE.MathUtils.smoothstep(Math.abs(slip), .07, .39) : 0;
      const assist = clamp(slip * (model.assist ?? .65), -.48, .48) * assistWeight * (assistMode === 'light' ? .26 : 1) * (1-Math.abs(turn)*.85);
      const transition = terrain && drift && turn*steer < 0 && Math.abs(slip) > .15;
      const steerResponse = model.response ?? 15;
      steer = damp(steer, clamp(turn * lock + assist, -lock, lock), drift ? (transition ? steerResponse + (setup.steerAngle ? 2.5 : 0) : 12) : 8, STEP);
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
      if (customTires && (grounded || inArena(currentPose.position.x,currentPose.position.z))) {
        driftAxle(true, throttle, torque, serviceBrake, handbrake, velocity);
        driftAxle(false, throttle, torque, serviceBrake, handbrake, velocity);
        if (grounded && tapLock && Math.abs(slip) < .26 && speed > 4) {
          const rotationAssist = Math.min(.8, Math.abs(turn)) * Math.sign(steer);
          yawTorque.y = -rotationAssist * model.mass * 8.4 * brakeRelease * STEP;
          body.applyTorqueImpulse(yawTorque, true);
        }
        // Damp excessive rotation once the driver countersteers or releases the gas.
        const stabilizing = !handbrake && (turn * slip > .07 || throttle <= 0 || Math.abs(turn) < .1);
        if (grounded && stabilizing && kmh > 18) {
          const yawRate = body.angvel().y;
          const catchWeight = linkTime > 0 && turn*yawRate > 0 ? 1.65 : 1;
          const centeredCoast = setup.steerAngle && throttle <= 0 && Math.abs(turn) < .1;
          const slipWeight = THREE.MathUtils.smoothstep(Math.abs(slip),centeredCoast ? .08 : .20,centeredCoast ? .48 : .81);
          const strength = catchWeight * (assistMode === 'light' ? 1.65 : 3.5) * slipWeight;
          yawTorque.y = -yawRate * model.mass * 2 * strength * STEP;
          body.applyTorqueImpulse(yawTorque, true);
        }
      }
      if (fault === 'tires' && moving && kmh > 6 && suspension.wheelIsInContact(0)) {
        const drag = new THREE.Vector3(0, 0, Math.sign(speed) * Math.min(290, 35 * Math.abs(speed)));
        drag.applyQuaternion(currentPose.rotation);
        suspension.wheelContactPoint(0) && body.applyImpulseAtPoint(drag.multiplyScalar(STEP), suspension.wheelContactPoint(0), true);
      }
      suspension.updateVehicle(STEP, undefined, undefined, collider => drift && driftGround
        ? groundHandles.has(collider.handle) : !hullHandles.has(collider.handle));
      return handbrake;
    }

    function afterStep(handbrake) {
      if (lifted) return;
      for (let i = 0; i < wheelSpin.length; i++) {
        const rotation = suspension.wheelRotation(i) ?? 0;
        if (!handbrake || WHEEL_Z[i] < 0) wheelSpin[i] += rotation - lastWheelRotation[i];
        lastWheelRotation[i] = rotation;
      }
      hit = impacts.has(hull.handle);
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
    const car = {
      setModel, setLift, reset, render, prepare, afterStep,
      get collider() { return hull; },
      wheelPose() {
        return wheelSpin.map((spin,i) => [
          spin,suspension.wheelSteering(i) ?? 0,anchorY-(suspension.wheelSuspensionLength(i) ?? rest),
        ]);
      },
      remove() {
        if (!cars.delete(car)) return;
        hullHandles.delete(hull.handle);
        physics.removeVehicleController(suspension);
        physics.removeRigidBody(body);
      },
      setSetup(values) { setup = values; },
      setAssist(mode) { assistMode = mode; },
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
      get velocity() { return body.linvel(); },
      get totalSpeed() { const v = body.linvel(); return Math.hypot(v.x, v.z); },
    };
    cars.add(car);
    return car;
  }

  const player = createCar();
  return Object.assign(player, {
    addCar: createCar,
    setCarContacts(enabled) {
      carContacts = enabled;
      for (const car of cars) car.collider.setCollisionGroups(hullGroups());
    },
    tick(input = {}, guestInput = {}) {
      gate.setTranslation({ x: 0, y: (input.gateY ?? 0) + 2.18, z: 7.95 });
      const brakes = [];
      for (const car of cars) brakes.push(car.prepare(car === player ? input : guestInput));
      physics.step(events);
      impacts.clear();
      events.drainContactForceEvents(event => {
        const a = event.collider1(), b = event.collider2();
        if (!groundHandles.has(a) && !groundHandles.has(b)) {
          impacts.add(a);
          impacts.add(b);
        }
      });
      for (const car of cars) {
        if (!carContacts || car === player) continue;
        physics.contactPair(player.collider,car.collider,manifold => {
          for (let i=0;i<manifold.numContacts();i++) {
            if (manifold.contactDist(i) > .002) continue;
            impacts.add(player.collider.handle);
            impacts.add(car.collider.handle);
            break;
          }
        });
      }
      let index = 0;
      for (const car of cars) car.afterStep(brakes[index++]);
    },
  });
}
