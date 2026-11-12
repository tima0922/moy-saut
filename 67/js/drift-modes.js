import { Group, MathUtils } from 'three';
import { batchSharedMeshes } from './garage-visuals.js';

export const PRACTICE_PAD = { x: 220, z: 180, w: 62, d: 46 };
export const TANDEM_HEAT = 45;

export function practiceStart(layout, zone) {
  if (zone === 'pad') return { x: PRACTICE_PAD.x, z: PRACTICE_PAD.z+12, yaw: 0, gate: 0 };
  const gate = Number(zone);
  const index = layout.road.indexOf(layout.gates[gate].position);
  const sample = (index - 14 + layout.road.length) % layout.road.length;
  const p = layout.road[sample], d = layout.directions[sample];
  return { x:p.x,z:p.z,yaw:Math.atan2(-d.x,-d.z),gate };
}

export function createPracticePad(world, asphalt) {
  const { scene, box, textPlane } = world;
  const { x,z,w,d } = PRACTICE_PAD;
  const root = new Group();
  scene.add(root);
  const track = asphalt.clone();
  const surface = box(root,[w,.04,d],[x,-.025,z],track);
  surface.castShadow = false;
  surface.receiveShadow = true;
  const line = track.clone();
  line.map = null;
  line.color.setHex(0xc7be93);
  const wall = track.clone();
  wall.map = null;
  wall.color.setHex(0x5f6b70);
  const obstacles = [
    { x:x-w/2+.4,z,w:.7,d,h:1 },{ x:x+w/2-.4,z,w:.7,d,h:1 },
    { x,z:z-d/2+.4,w,d:.7,h:1 },{ x,z:z+d/2-.4,w,d:.7,h:1 },
  ];
  for (const b of obstacles) box(root,[b.w,b.h,b.d],[b.x,b.h/2,b.z],wall);
  for (const dx of [-10,10]) {
    const cx=x+dx;
    obstacles.push({x:cx,z,w:1.4,d:1.4,h:.76});
    for (let tire=0; tire<3; tire++) world.cylinder(root,.7,.7,.24,[cx,.12+tire*.24,z],world.mats.rubber,[0,0,0],20);
    for (let n=0; n<32; n++) {
      const angle=n*Math.PI/16;
      box(root,[.12,.012,.91],[cx+Math.cos(angle)*10,.013,z+Math.sin(angle)*10],line,[0,-angle,0]).castShadow=false;
    }
  }
  textPlane(root,'КОНТУР 67 / ПЛОЩАДКА ВОСЬМЁРОК',16,1,[x,2.25,z-d/2+.78],[0,0,0],'#fff7d8','#28353a');
  batchSharedMeshes(root);
  root.visible = false;
  return { root, obstacles };
}

// The chase car must be behind the lead car's direction of travel.
// Signed slip prevents bonuses for drifting in opposite directions.
export function tandemMatch(lead, chase) {
  if (!lead.sliding || !chase.sliding || lead.hit || chase.hit || lead.slip*chase.slip <= 0) return 0;
  const speed = Math.hypot(lead.velocity.x,lead.velocity.z);
  if (speed < 5) return 0;
  const fx=lead.velocity.x/speed, fz=lead.velocity.z/speed;
  const chaseSpeed=Math.hypot(chase.velocity.x,chase.velocity.z);
  if (chaseSpeed<5 || (chase.velocity.x*fx+chase.velocity.z*fz)/chaseSpeed<.88) return 0;
  const pace = 1-MathUtils.smoothstep(Math.abs(speed-chaseSpeed),1.5,5.5);
  const dx=chase.position.x-lead.position.x, dz=chase.position.z-lead.position.z;
  const gap=-(dx*fx+dz*fz), lateral=Math.abs(dx*fz-dz*fx);
  const difference=Math.abs(lead.slip-chase.slip);
  if (gap<3.1 || gap>13 || lateral>3.8 || difference>.58) return 0;
  return pace*(1-MathUtils.smoothstep(gap,5,13)) *
    (1-MathUtils.smoothstep(lateral,1.2,3.8)) *
    (1-MathUtils.smoothstep(difference,.16,.58));
}

export function createTandem() {
  const totals = [0,0];
  const bonus = [0,0];
  let leader = 0;
  let heat = 1;
  let done = false;
  let pending = 0;
  let quiet = 0;
  let active = 0;
  const interrupt = () => { pending = quiet = active = 0; };
  function bank() {
    if (active>=.28) bonus[1-leader] += Math.floor(pending);
    interrupt();
  }
  return {
    totals, bonus, interrupt,
    get pending() { return pending; },
    get leader() { return leader; },
    get heat() { return heat; },
    get done() { return done; },
    tick(dt, drivers) {
      if (done) return;
      if (drivers.some(driver => driver.hit || driver.up<.5 || driver.warning)) {
        interrupt();
        return;
      }
      const quality = tandemMatch(drivers[leader],drivers[1-leader]);
      if (quality>0) {
        pending += quality * 58 * dt;
        quiet = 0;
        active += dt;
      } else if (pending && (quiet+=dt)>.42) bank();
    },
    closeHeat(scores) {
      if (done) return false;
      bank();
      for (let i=0; i<2; i++) totals[i] += scores[i];
      if (heat === 2) {
        done = true;
        return false;
      }
      heat = 2;
      leader = 1;
      return true;
    },
  };
}
