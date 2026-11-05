// Canonical scene projection from committed gameplay state.
// Safe to call after interrupted animations, on resume, and after GPU recovery.
import * as THREE from 'three';
import {PARTS,JOBS} from './game-state.js';

function benchPosition(id){const index=PARTS.findIndex(p=>p.id===id);const column=index%6,row=Math.floor(index/6);
  return new THREE.Vector3(4.05+column*.39,1.17+row*.08,-3.83+row*.24);}

export function applyCommittedState(world,session){
  world.highlight.visible=false;
  world.car.position.set(0,session.lift,session.delivered?13:0);
  world.car.rotation.set(0,0,0);
  world.contact.position.z=session.delivered?13:0;
  world.contact.material.opacity=session.lift?.45:1;
  world.arms.position.y=session.lift;
  world.hood.rotation.x=session.hoodOpen?1.13:.02;
  world.door.position.y=session.delivered?4.5:0;
  world.crane.position.set(3.7,0,2.7);
  if(session.done.has('crane_move')&&!session.done.has('engine_stand'))world.crane.position.set(0,0,0);
  if(session.engineLocation==='stand')world.crane.position.set(4.4,0,1.8);
  if(session.done.has('engine_return')&&!session.done.has('engine_install'))world.crane.position.set(0,0,0);
  world.car.attach(world.engine);
  world.engine.position.set(0,.68,-1.28);
  if(session.engineLocation!=='car'){
    world.scene.attach(world.engine);
    if(session.engineLocation==='stand')world.engine.position.set(3.55,1.32,-1.03);
    else if(session.done.has('engine_return'))world.engine.position.set(0,1.95,-1.28);
    else world.engine.position.set(0,1.95,-1.28);
  }
  const replacementPart=JOBS[session.jobId].replacementPart;
  for(const [id,rec] of world.partObjects){
    rec.original??=rec.object;
    if(rec.object!==rec.original){rec.object.parent?.remove(rec.object);rec.object=rec.original;}
    const orig=rec.original;
    rec.homeParent.attach(orig);
    orig.position.copy(rec.homePosition);orig.quaternion.copy(rec.homeRotation);orig.scale.set(1,1,1);
    // Only a replaced part's old original remains on the bench after fitment.
    const replaced= id===replacementPart&&session.replacedParts.has(id);
    if(session.removed.has(id)||replaced){
      world.scene.attach(orig);orig.position.copy(benchPosition(id));orig.scale.setScalar(.38);
    }
    if(replaced&&!session.removed.has(id)){
      const fresh=orig.clone(true);
      fresh.name=id+'-new';
      rec.homeParent.add(fresh);
      fresh.position.copy(rec.homePosition);fresh.quaternion.copy(rec.homeRotation);fresh.scale.setScalar(1);
      rec.object=fresh;
    }
    world.targets.set(id,rec.object);
  }
  for(const [id,b] of world.bolts){
    b.position.copy(b.userData.home);
    b.rotation.set(0,0,0);
    b.visible=!session.looseBolts.has(id);
  }
  world.newPart.visible=!session.replaced;
  world.scene.updateMatrixWorld(true);
}
