import { RESET_PENALTY } from './competition.js?v=030';
import * as THREE from 'three';

export const RACE_LAPS = 3;
const DEFAULT_HALF_WIDTH = 8;
const PICKUP_RADIUS = 2.3;
const keyFor = track => 'garage-life-neon-'+track;

export function readRaceBest(storage,track) {
  try {
    const value=Number(storage?.getItem(keyFor(track)));
    return Number.isFinite(value) && value>0 ? value : null;
  } catch { return null; }
}

export function saveRaceBest(storage,track,time) {
  const best=readRaceBest(storage,track);
  if (best!==null && best<=time) return best;
  try { storage?.setItem(keyFor(track),String(time)); } catch { /* Storage is optional. */ }
  return time;
}

// Wake grows behind a moving car and drops out when the follower pulls alongside.
export function draftStrength(position,velocity,other) {
  const speed=Math.hypot(velocity.x,velocity.z);
  const leadSpeed=Math.hypot(other[7],other[8]);
  if(speed<10 || leadSpeed<10 || Math.abs(position.y-other[1])>1.5) return 0;
  const fx=other[7]/leadSpeed,fz=other[8]/leadSpeed;
  if((fx*velocity.x+fz*velocity.z)/speed<.94) return 0;
  const dx=other[0]-position.x,dz=other[2]-position.z;
  const gap=dx*fx+dz*fz, sideways=Math.abs(dx*fz-dz*fx);
  if(gap<4 || gap>=25 || sideways>=2.6) return 0;
  return Math.min(1,(gap-4)/3,(25-gap)/10)*(1-sideways/2.6);
}

export function createRaceCourse(layout,height=layout.heightAt ?? (()=>0)) {
  const {road,directions,widths}=layout;
  const count=road.length;
  const intervalCount=layout.city ? 24 : 16;
  const halfWidth=i=>widths?.[i] ?? DEFAULT_HALF_WIDTH;
  const at=index=>{
    const {x,z}=road[index];
    return new THREE.Vector3(x,height(x,z),z);
  };
  const gates=Array.from({length:intervalCount},(_,i)=>{
    const index=Math.floor((i+1)*count/intervalCount)%count;
    return {point:at(index),dir:directions[index],half:halfWidth(index)+.32,index};
  });
  const pickupCount=layout.city ? 12 : 8;
  const pickups=Array.from({length:pickupCount},(_,i)=>{
    const index=Math.floor((i+.55)*count/pickupCount);
    const point=at(index),dir=directions[index];
    const offset=(i%2 ? -1 : 1)*(layout.city ? halfWidth(index)*.53 : 3.55);
    point.x+=dir.z*offset;
    point.z-=dir.x*offset;
    point.y=height(point.x,point.z);
    return {point,kind:i%3===1 ? 'grip' : 'nitro'};
  });

  function place(point,dir,along,across=0) {
    const x=point.x+along*dir.x+across*dir.z;
    const z=point.z+along*dir.z-across*dir.x;
    return {x,z,y:height(x,z),yaw:Math.atan2(-dir.x,-dir.z)};
  }
  const grid=slot=>place(gates.at(-1).point,gates.at(-1).dir,
    slot===undefined ? -7 : -7-Math.floor(slot/2)*6,slot===undefined ? 0 : slot%2 ? 2.65 : -2.65);
  const segments=road.map((a,i)=>{
    const b=road[(i+1)%count];
    const dx=b.x-a.x,dz=b.z-a.z;
    return {a,dx,dz,inverse:1/(dx*dx+dz*dz)};
  });
  const distanceAt=[0];
  for (const {dx,dz} of segments) distanceAt.push(distanceAt.at(-1)+Math.hypot(dx,dz));
  const length=distanceAt.at(-1);
  function project({x,z},hint) {
    let nearest=0,fraction=0,distance=Infinity;
    function scan(start,steps) {
      for (let j=0;j<steps;j++) {
        const i=(start+j+count)%count;
        const {a,dx,dz,inverse}=segments[i];
        const rx=x-a.x,rz=z-a.z;
        const t=Math.max(0,Math.min(1,(rx*dx+rz*dz)*inverse));
        const square=(rx-dx*t)**2+(rz-dz*t)**2;
        if (square>=distance) continue;
        distance=square;
        nearest=i;
        fraction=t;
      }
    }
    if (hint!==undefined) scan(hint-14,29);
    // A respawn or a large step can leave the previous search window.
    if (distance>(halfWidth(nearest)+1.2)**2) scan(0,count);
    const meters=THREE.MathUtils.lerp(distanceAt[nearest],distanceAt[nearest+1],fraction);
    return {nearest,fraction,distance,meters,half:halfWidth(nearest),tangent:directions[nearest]};
  }
  const sectors=layout.sections?.map(({i,name})=>({meters:distanceAt[i],name})) ?? [];
  function sector(meters) {
    return sectors.findLast(entry=>meters>=entry.meters)?.name ?? '';
  }
  const corners=layout.corners?.map(c=>({...c,meters:distanceAt[c.i]})) ?? [];
  function nextCorner(meters) {
    if (!corners.length) return null;
    const corner=corners.find(c=>c.meters>=meters) ?? corners[0];
    return {left:corner.angle>0,meters:(corner.meters-meters+length)%length,speed:corner.speed};
  }
  const recovery=index=>index<0 ? grid() : place(gates[index].point,gates[index].dir,3.7);
  return {gates,pickups,grid,recovery,project,length,sector,nextCorner,distanceAt,
    roadDistance:position=>project(position).distance};
}

function crossingFraction(from,to,{point,dir,half}) {
  const a=(from.x-point.x)*dir.x+(from.z-point.z)*dir.z;
  const b=(to.x-point.x)*dir.x+(to.z-point.z)*dir.z;
  if (a>=0 || b<0 || b-a<.0001) return null;
  const t=-a/(b-a);
  const x=from.x+(to.x-from.x)*t-point.x;
  const z=from.z+(to.z-from.z)*t-point.z;
  const y=from.y+(to.y-from.y)*t-point.y;
  return Math.abs(x*dir.z-z*dir.x)<=half && Math.abs(y)<3 ? t : null;
}

export function createNeonRun(course,startsAt) {
  let last, lastGate=-1, next=0, laps=0, resets=0, charges=1, finished, offSince;
  let boostUntil=0,gripUntil=0;
  let reverseSince, wrongWay=false, lapStarted=startsAt, lapResets=0, bestLap, lastLap;
  let progress=0, missed=false, sample, crossing;
  let crossedStart=false;
  const collected=course.pickups.map(()=>false);
  return {
    startsAt, get crossing(){return crossing;}, get progress(){return progress;}, get missed(){return missed;},
    get corner(){return sample ? course.nextCorner(sample.meters) : null;},
    get sector(){return sample ? course.sector(sample.meters) : '';},
    get lap(){return Math.min(laps+1,RACE_LAPS);},
    get bestLap(){return bestLap;},get lastLap(){return lastLap;},get wrongWay(){return wrongWay;},
    get next(){return next;},get charges(){return charges;},get resets(){return resets;},get elapsed(){return finished;},
    get gate(){return course.gates[next];},get offRoad(){return offSince!==undefined;},
    available:index=>!collected[index],
    boosted:now=>now<boostUntil,
    grip:now=>now<gripUntil,
    activate(now) {
      if(now<startsAt || finished!==undefined || charges===0 || now<boostUntil) return false;
      charges--;
      boostUntil=now+2400;
      return true;
    },
    recover(now) {
      if(now<startsAt || finished!==undefined) return null;
      last=sample=crossing=undefined;
      if (!laps && lastGate<0) crossedStart=false;
      missed=false;
      reverseSince=undefined; wrongWay=false;
      offSince=undefined;
      boostUntil=gripUntil=0;
      resets++;
      return course.recovery(lastGate);
    },
    tick(now,position,grounded) {
      crossing=undefined;
      if(now<startsAt || finished!==undefined) return;
      const {x,y,z}=position;
      const pose={x,y,z,now};
      sample=course.project(pose,sample?.nearest);
      const onRoad=sample.distance<=(sample.half+1)**2;
      const gate=course.gates[next];
      const gateMeters=course.distanceAt[gate.index] || course.length;
      let beyond=sample.meters-gateMeters;
      if (beyond < -course.length/2) beyond+=course.length;
      if (beyond > course.length/2) beyond-=course.length;
      missed=onRoad && beyond>16 && beyond<Math.min(course.length/3,course.length/course.gates.length*2.3);
      if (onRoad) {
        const previous=next>0 ? course.distanceAt[course.gates[next-1].index] : 0;
        progress=laps+THREE.MathUtils.clamp(gateMeters+beyond,previous,gateMeters)/course.length;
      }
      if (last) {
        const {tangent}=sample;
        const along=(x-last.x)*tangent.x+(z-last.z)*tangent.z;
        if(onRoad && along<-.025) reverseSince ??= now;
        else if(along>.01 || !onRoad) reverseSince=undefined;
        wrongWay=reverseSince!==undefined && now-reverseSince>650;
      }
      if (onRoad) offSince=undefined;
      else offSince ??= now;
      if (sample.distance>(sample.half+10)**2 || y < -4 ||
          offSince!==undefined && now-offSince>2400) return 'recover';
      const canCross=onRoad && last && Math.hypot(x-last.x,z-last.z)<20;
      const first=canCross && !crossedStart && next===0 && !laps ? crossingFraction(last,pose,course.gates.at(-1)) : null;
      if (first!==null) {
        crossedStart=true;
        crossing={at:THREE.MathUtils.lerp(last.now,now,first), fraction:first, line:true, sector:0};
      }
      const fraction=canCross ? crossingFraction(last,pose,gate) : null;
      if (fraction!==null) {
        missed=false;
        lastGate=next++;
        const crossedAt=THREE.MathUtils.lerp(last.now,now,fraction);
        const line=next===course.gates.length;
        const sector=next*4/course.gates.length;
        if (Number.isInteger(sector)) crossing={at:crossedAt, fraction, line, sector};
        if (line) {
          crossedStart=true;
          next=0;
          lastLap=Math.round(crossedAt-lapStarted)+(resets-lapResets)*RESET_PENALTY;
          bestLap=Math.min(bestLap ?? Infinity,lastLap);
          lapStarted=crossedAt;
          lapResets=resets;
          if (++laps===RACE_LAPS) {
            progress=RACE_LAPS;
            finished=Math.max(0,Math.round(crossedAt-startsAt));
            return 'finished';
          }
          collected.fill(false);
        }
      }
      last=pose;
      if(!onRoad || !grounded) return;
      for(const [i,{point,kind}] of course.pickups.entries()) {
        if(collected[i] || Math.abs(y-point.y)>1.35 || (x-point.x)**2+(z-point.z)**2>PICKUP_RADIUS**2) continue;
        if(kind==='nitro' && charges>=3) continue;
        collected[i]=true;
        if(kind==='nitro') charges++;
        else gripUntil=now+4600;
        return kind;
      }
    },
  };
}
