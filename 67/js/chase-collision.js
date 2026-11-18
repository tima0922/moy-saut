const CELL = 32;
// One bucket query covers the complete chase camera sweep, including a mouse orbit.
const MARGIN = 12;

export function indexCameraBarriers(obstacles) {
  const cells=new Map();
  for (const box of obstacles) {
    if (box.drivable || box.motion) continue;
    const sin=Math.sin(box.yaw ?? 0),cos=Math.cos(box.yaw ?? 0);
    const w=box.w/2+.14,d=box.d/2+.14;
    const radiusX=Math.abs(cos)*w+Math.abs(sin)*d+MARGIN;
    const radiusZ=Math.abs(sin)*w+Math.abs(cos)*d+MARGIN;
    const minX=Math.floor((box.x-radiusX)/CELL),maxX=Math.floor((box.x+radiusX)/CELL);
    const minZ=Math.floor((box.z-radiusZ)/CELL),maxZ=Math.floor((box.z+radiusZ)/CELL);
    const y=box.y ?? 0;
    const shape={x:box.x,z:box.z,w,d,sin,cos,bottom:y-.12,top:y+box.h+.14};
    for (let x=minX;x<=maxX;x++) for (let z=minZ;z<=maxZ;z++) {
      const key=x+','+z;
      if (!cells.has(key)) cells.set(key,[]);
      cells.get(key).push(shape);
    }
  }
  const empty=[];
  return (x,z)=>cells.get(Math.floor(x/CELL)+','+Math.floor(z/CELL)) ?? empty;
}

export function chaseFraction(start,end,barriers) {
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
  let fraction=1;
  for (const {x,z,w,d,sin,cos,bottom,top} of barriers) {
    const vx=start.x-x,vz=start.z-z;
    const lx=vx*cos-vz*sin,lz=vx*sin+vz*cos;
    const ax=dx*cos-dz*sin,az=dx*sin+dz*cos;
    let near=0,far=fraction;
    for (let dim=0;dim<3;dim++) {
      const origin=dim===0 ? lx : dim===1 ? start.y : lz;
      const delta=dim===0 ? ax : dim===1 ? dy : az;
      const min=dim===0 ? -w : dim===1 ? bottom : -d;
      const max=dim===0 ? w : dim===1 ? top : d;
      if (Math.abs(delta)<.0001) {
        if (origin<min || origin>max) { far=-1; break; }
        continue;
      }
      const a=(min-origin)/delta,b=(max-origin)/delta;
      near=Math.max(near,Math.min(a,b));
      far=Math.min(far,Math.max(a,b));
      if (near>far) break;
    }
    if (near>.02 && near<=far) fraction=Math.max(.075,near-.025);
  }
  return fraction;
}
