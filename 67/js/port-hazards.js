import * as THREE from 'three';

const OPENING = 900;
const OPEN = 3250;
const CLOSING = 950;

export function portHazards(sectors) {
  return [
    [2,34,14,0,'slide',-1,2100],
    [5,31,14,0,'lift',1,4300],
    [14,36,8.7,0,'lift',1,1200],
    [20,42,5,0,'lift',1,3500],
    [24,32,14,0,'lift',1,2800],
    [27,119,8.6,2.75,'slide',1,5800],
    [10,32,14,0,'sweep',-1,490],
    [17,31,14,0,'lift',1,5150],
    [23,137,14,0,'sweep',1,3580],
  ].map(([number,along,width,floor,kind,side,phase],index)=>{
    const sector=sectors[number-1];
    const period=7900+(index%3)*640;
    const w=kind==='sweep' ? 3.2 : width+.55;
    return {x:sector.x,z:sector.z+along,w,h:2.15,d:1.65,
      y:floor,floor,kind,side,phase,period,width,travel:kind==='sweep' ? (w+width)/2+2 : w+1.25};
  });
}

export function portSignal(hazard,time) {
  const phase=(Math.max(0,time)+hazard.phase)%hazard.period;
  if (phase<OPENING) return ['opening',OPENING-phase];
  if (phase<OPENING+OPEN) return ['open',OPENING+OPEN-phase];
  if (phase<OPENING+OPEN+CLOSING) return ['closing',OPENING+OPEN+CLOSING-phase];
  return ['closed',hazard.period-phase];
}

export function portHazardPose(hazard,time) {
  const [state,left]=portSignal(hazard,time);
  const t=state==='open' ? 1 : state==='closed' ? 0 :
    state==='opening' ? 1-left/OPENING : left/CLOSING;
  const slide=t*t*(3-2*t);
  const lift=hazard.kind==='lift';
  return {x:hazard.x+(lift ? 0 : hazard.side*slide*hazard.travel),
    y:hazard.floor+hazard.h/2+(lift ? 3.45*slide : 0),z:hazard.z};
}

export function buildPortHazard(chunk,world,hazard,paint) {
  const body=new THREE.Group();
  chunk.add(body);
  const amber=new THREE.MeshBasicMaterial({color:0xff6640});
  function box(parent,x,y,z,w,h,d,material) {
    const mesh=world.box(parent,[w,h,d],[x,y,z],material);
    mesh.castShadow=false;
    return mesh;
  }
  const {x,z,floor,w,h,kind,width}=hazard;
  box(body,0,0,0,w,h,hazard.d,paint.ink);
  for (const end of [-1,1]) {
    box(body,0,0,end*.835,w-.13,.84,.035,paint.rust);
    for (let i=0;i<7;i++) {
      box(body,(i-3)*(w-.5)/7,0,end*.862,(w-.5)/15,.84,.026,paint.yellow)
        .rotation.z=.37;
    }
  }
  for (const side of [-1,1]) {
    const edge=x+side*(width/2+.64);
    const pylon=kind==='lift' ? 5.9 : 2.75;
    box(chunk,edge,floor+pylon/2,z,.32,pylon,.44,paint.steel);
    box(chunk,edge,floor+pylon-.25,z-.28,.29,.33,.2,amber);
  }
  if (kind==='lift') box(chunk,x,floor+5.88,z,w+1.68,.32,.52,paint.steel);
  if (kind==='sweep') {
    const reach=hazard.travel;
    for (const edge of [-1,1]) {
      box(chunk,x+hazard.side*reach/2,floor-.055,z+edge*.98,width/2+reach+2,.10,.15,paint.steel);
    }
    box(body,0,.98,0,w-.24,.16,hazard.d-.15,paint.yellow);
  }
  box(chunk,x,floor+.025,z-8,width-.18,.032,.42,paint.light);
  world.textPlane(chunk,kind==='lift' ? 'ШЛЮЗ · ЖДИ ЗЕЛЁНЫЙ' : 'ПОДВИЖНЫЙ ГРУЗ · ЖДИ ЗЕЛЁНЫЙ',7,.44,
    [x,floor+3.5,z-8.1],[0,Math.PI,0],'#ffdf91','#26323a');

  return {hazard,body,amber};
}
