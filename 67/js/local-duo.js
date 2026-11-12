import { Group, MathUtils, PerspectiveCamera, Quaternion, Vector3, Euler } from 'three';
import { createRun } from './drift.js?v=015';

export function createGuest({ scene, rig, world, spec, setup, layout, effects, color }) {
  const car = new Group();
  const shell = rig.root.clone(true);
  const originals = [], copies = [];
  rig.root.traverse(object => originals.push(object));
  shell.traverse(object => copies.push(object));
  const mapping = new Map(originals.map((object,i) => [object,copies[i]]));
  const paints = new Map([...rig.paints].map(mat => [mat,mat.clone()]));
  for (const paint of paints.values()) paint.color.set(color);
  for (const object of copies) {
    if (object.isLight) object.visible = false;
    if (object.isMesh) {
      const resolve = mat => paints.get(mat) ?? mat;
      object.material = Array.isArray(object.material) ? object.material.map(resolve) : resolve(object.material);
    }
  }
  shell.position.set(0,0,0);
  shell.rotation.set(0,0,0);
  shell.scale.setScalar(1);
  car.add(shell);
  car.scale.z = spec.length;
  scene.add(car);
  const physics = world.addCar();
  physics.setModel(spec);
  physics.setSetup(setup);
  const wheels = rig.wheels.map(wheel => mapping.get(wheel));
  const hubs = rig.hubs.map(hub => mapping.get(hub));
  const camera = new PerspectiveCamera(63,1,.035,185);
  const focus = new Vector3();
  const desired = new Vector3();
  const axis = new Vector3(0,1,0);
  const heading = new Quaternion();
  const euler = new Euler(0,0,0,'YXZ');
  let yaw;
  let race;

  const guest = {
    physics,camera,effects,car,wheels,hubs,
    get race() { return race; },
    reset(x,z,angle,options) {
      race = createRun(layout,options);
      effects.reset();
      this.place(x,z,angle);
    },
    place(x,z,angle) {
      physics.reset(x,z,angle);
      physics.running = true;
      yaw = angle;
      physics.render(car,wheels,1,hubs);
    },
    draw(dt, alpha, constrain) {
      physics.render(car,wheels,alpha,hubs);
      euler.setFromQuaternion(car.quaternion);
      const goal = euler.y - MathUtils.clamp(physics.slip*.34,-.32,.32);
      yaw += MathUtils.damp(0,Math.atan2(Math.sin(goal-yaw),Math.cos(goal-yaw)),7,dt);
      heading.setFromAxisAngle(axis,yaw);
      focus.copy(car.position).add(new Vector3(0,1.02,0));
      desired.set(0,2.25,6.9+Math.min(1.2,physics.totalSpeed*.04)).applyQuaternion(heading).add(focus);
      camera.position.copy(constrain(focus,desired));
      camera.lookAt(focus);
      camera.updateMatrixWorld();
    },
    remove() {
      car.removeFromParent();
      effects.reset();
      physics.remove();
      for (const paint of paints.values()) paint.dispose();
    },
  };
  return guest;
}

export function raceTelemetry(physics) {
  return {
    position: physics.position, velocity: physics.velocity, speed: physics.totalSpeed, slip: physics.slip,
    grounded: physics.grounded, hit: physics.hit, up: physics.up,
  };
}
