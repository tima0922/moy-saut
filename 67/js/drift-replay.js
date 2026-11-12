import { MathUtils, Vector3 } from 'three';

const SAMPLE = 1/20;
const MAX_FRAMES = 240;

export function createReplayRecorder() {
  let leadIn = [];
  let current = null;
  let best = null;
  let elapsed = 0;
  let eventSeen = 0;
  return {
    get best() { return best; },
    tick(dt,physics,run,other) {
      elapsed += dt;
      if (elapsed>=SAMPLE) {
        elapsed -= SAMPLE;
        const sample = {
          p:physics.position.clone(), q:physics.rotation.clone(), rpm:physics.rpm, w:physics.wheelPose?.(),
          other:other ? { p:other.position.clone(),q:other.rotation.clone(),w:other.wheelPose?.() } : null,
        };
        if (!current && run.sliding) current = [...leadIn];
        if (current) {
          current.push(sample);
          if (current.length > MAX_FRAMES) current.shift();
        }
        leadIn.push(sample);
        if (leadIn.length>20) leadIn.shift();
      }
      for (const event of run.events) {
        if (event.id <= eventSeen) continue;
        eventSeen = event.id;
        if (event.kind === 'bank' && current?.length>8 && (!best || event.points>best.points)) {
          best = { points:event.points, frames:current };
        }
        if (event.kind === 'bank' || event.kind === 'loss') current = null;
      }
      if (!run.chain && !run.sliding && run.status !== 'ready') current = null;
    },
  };
}

export function createReplayPlayer(clip, terrain, pad) {
  let time=0;
  let rpm=0;
  let cameraAnchor;
  const tangent=new Vector3();
  const offset=new Vector3();
  const position=new Vector3();
  const { frames } = clip;
  function draw(visual,a,b,t) {
    visual.car.position.lerpVectors(a.p,b.p,t);
    visual.car.quaternion.copy(a.q).slerp(b.q,t);
    if (!a.w || !b.w) return;
    for (let i=0;i<visual.wheels.length;i++) {
      visual.wheels[i].rotation.x = MathUtils.lerp(a.w[i][0],b.w[i][0],t);
      visual.hubs[i].rotation.y = MathUtils.lerp(a.w[i][1],b.w[i][1],t);
      visual.hubs[i].position.y = MathUtils.lerp(a.w[i][2],b.w[i][2],t);
    }
  }
  return {
    get rpm() { return rpm; },
    tick(dt,target,camera,constrain) {
      time += dt*.83;
      const frame = Math.min(frames.length-1,time/SAMPLE);
      const i = Math.floor(frame), next = Math.min(i+1,frames.length-1);
      const a=frames[i], b=frames[next];
      rpm = a.rpm+(b.rpm-a.rpm)*(frame-i);
      position.lerpVectors(a.p,b.p,frame-i);
      draw(target,a,b,frame-i);
      if (target.other && a.other && b.other) draw(target.other,a.other,b.other,frame-i);
      // Switch between fixed trackside cameras along a long recorded chain.
      if (!cameraAnchor || cameraAnchor.distanceToSquared(position)>37**2) {
        const ahead = frames[Math.min(i+12,frames.length-1)].p;
        const previous = frames[Math.max(0,i-8)].p;
        tangent.copy(ahead).sub(previous).setY(0).normalize();
        if (tangent.lengthSq()<.01) tangent.set(1,0,0);
        offset.set(-tangent.z,0,tangent.x);
        cameraAnchor=position.clone().addScaledVector(offset,11).addScaledVector(tangent,7);
        cameraAnchor.y=(pad ? 0 : terrain.heightAt(cameraAnchor.x,cameraAnchor.z))+2.85;
      }
      const focus=position.clone().add(new Vector3(0,.7,0));
      camera.position.copy(constrain(focus,cameraAnchor.clone()));
      camera.lookAt(focus);
      return frame >= frames.length-1;
    },
  };
}
