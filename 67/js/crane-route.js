export const CRANE = {
  reach: 2.15,
  yaw: Math.PI,
  park: { x: -4.85, z: -6.25 },
  bay: { x: 0, z: -3.43 },
  clear: { x: 0, z: -7 },
  dock: { x: 2.75, z: -7 },
  high: 1.86,
  engineBay: { x: 0, y: .61, z: -1.28 },
  engineStand: { x: 2.75, y: 1.32, z: -4.85 },
};

export function positionChain(world, height) {
  const end = height == null ? .37 : Math.max(.12, world.chain.position.y - height - .32);
  world.chain.scale.y = end / .37;
}

export function projectCrane(world, session) {
  const attached = session.engineLocation === 'crane';
  const atBay = session.done.has('crane_move') && !session.done.has('engine_stand');
  const position = attached || atBay ? CRANE.bay : CRANE.park;
  world.crane.position.set(position.x, 0, position.z);
  world.crane.rotation.y = CRANE.yaw;
  positionChain(world, attached ? CRANE.high : undefined);
}
