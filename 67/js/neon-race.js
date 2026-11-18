import { RESET_PENALTY } from './competition.js?v=030';
import * as THREE from 'three';

export const RACE_LAPS = 3;
const ROAD_LIMIT = 9;
const GATE_HALF = 8;
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

export function createRaceCourse(layout,height=()=>0) {
  const {road,directions}=layout;
  const at=index=>{
    const point=road[index];
    return new THREE.Vector3(point.x,height(point.x,point.z),point.z);
  };
  const gates=[], pickups=[];
  const intervals=16;
  for(let i=1;i<=intervals;i++) {
    const index=Math.floor(i*road.length/intervals)%road.length;
    gates.push({point:at(index),dir:directions[index]});
  }
  for(let i=0;i<8;i++) {
    const index=Math.floor((i+.55)*road.length/8);
    const point=at(index),dir=directions[index];
    const offset=i%2 ? -3.55 : 3.55;
    point.x+=dir.z*offset;
    point.z-=dir.x*offset;
    point.y=height(point.x,point.z);
    pickups.push({point,kind:i%3===1 ? 'grip' : 'nitro'});
  }
  function place(point,dir,along,across=0) {
    const x=point.x+along*dir.x+across*dir.z;
    const z=point.z+along*dir.z-across*dir.x;
    return {x,z,y:height(x,z),yaw:Math.atan2(-dir.x,-dir.z)};
  }
  const grid=slot=>place(gates.at(-1).point,gates.at(-1).dir,slot===undefined ? -7 : -7-Math.floor(slot/2)*6,
    slot===undefined ? 0 : slot%2 ? 2.65 : -2.65);

  let nearest=0;
  function roadDistance(position) {
    let distance=Infinity;
    for(let i=0;i<road.length;i++) {
      const a=road[i], b=road[(i+1)%road.length];
      const x=b.x-a.x,z=b.z-a.z,rx=position.x-a.x,rz=position.z-a.z;
      const t=Math.max(0,Math.min(1,(rx*x+rz*z)/(x*x+z*z)));
      const square=(rx-x*t)**2+(rz-z*t)**2;
      if(square<distance) { distance=square; nearest=i; }
      if(distance<.04) break;
    }
    return distance;
  }
  const length=road.reduce((sum,p,i)=>sum+p.distanceTo(road[(i+1)%road.length]),0);
  function nextCorner() {
    if(!layout.corners?.length)return null;
    const corner=layout.corners.find(c=>c.i>=nearest) ?? layout.corners[0];
    const steps=(corner.i-nearest+road.length)%road.length;
    return {left:corner.angle>0,meters:steps*length/road.length};
  }
  const recovery=index=>index<0 ? grid() : place(gates[index].point,gates[index].dir,2.9);
  return {gates,pickups,grid,recovery,roadDistance,nextCorner,length, get tangent(){return directions[nearest];}};
}

function crosses(from,to,{point,dir}) {
  const a=(from.x-point.x)*dir.x+(from.z-point.z)*dir.z;
  const b=(to.x-point.x)*dir.x+(to.z-point.z)*dir.z;
  if(a>=0 || b<0 || b-a<.0001) return false;
  const t=-a/(b-a);
  const x=from.x+(to.x-from.x)*t-point.x;
  const z=from.z+(to.z-from.z)*t-point.z;
  const y=from.y+(to.y-from.y)*t-point.y;
  return Math.abs(x*dir.z-z*dir.x)<=GATE_HALF && Math.abs(y)<3;
}

export function createNeonRun(course,startsAt) {
  let last, lastGate=-1, next=0, laps=0, resets=0, charges=1, finished, offSince;
  let boostUntil=0,gripUntil=0;
  let reverseSince, wrongWay=false, lapStarted=startsAt, lapResets=0, bestLap, lastLap;
  const collected=course.pickups.map(()=>false);
  return {
    startsAt, get lap(){return Math.min(laps+1,RACE_LAPS);},
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
      last=undefined;
      reverseSince=undefined; wrongWay=false;
      offSince=undefined;
      boostUntil=gripUntil=0;
      resets++;
      return course.recovery(lastGate);
    },
    tick(now,position,grounded) {
      if(now<startsAt || finished!==undefined) return;
      const {x,y,z}=position;
      const pose={x,y,z};
      const distance=course.roadDistance(position);
      const onRoad=distance<=ROAD_LIMIT**2;
      if(last) {
        const along=(x-last.x)*course.tangent.x+(z-last.z)*course.tangent.z;
        if(onRoad && along<-.025) reverseSince ??= now;
        else if(along>.01 || !onRoad) reverseSince=undefined;
        wrongWay=reverseSince!==undefined && now-reverseSince>650;
      }
      if(onRoad) offSince=undefined;
      else offSince ??= now;
      if(distance>18**2 || y < -4 || offSince!==undefined && now-offSince>2400) return 'recover';
      if(onRoad && last && Math.hypot(x-last.x,z-last.z)<20 && crosses(last,pose,course.gates[next])) {
        lastGate=next;
        next++;
        if(next===course.gates.length) {
          next=0;
          lastLap=Math.round(now-lapStarted)+(resets-lapResets)*RESET_PENALTY;
          bestLap=Math.min(bestLap ?? Infinity,lastLap);
          lapStarted=now; lapResets=resets;
          if(++laps===RACE_LAPS) {
            finished=Math.max(0,Math.round(now-startsAt));
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
