import { MathUtils } from 'three';

const { clamp, lerp, smoothstep } = MathUtils;

// Blend opposing grades where the nearest branch changes across the track.
function softenJoins(heights, cols, rows, sx, sz) {
  const stride = cols+1;
  const high = heights.slice(), low = heights.slice();
  const grade = .17;
  const diagonal = grade*Math.hypot(sx,sz);
  for (const direction of [1,-1]) {
    const start = direction === 1 ? 0 : heights.length-1;
    for (let i=start; i>=0 && i<heights.length; i+=direction) {
      const col=i%stride, row=Math.floor(i/stride);
      const near = (j,limit) => {
        high[i]=Math.min(high[i],high[j]+limit);
        low[i]=Math.max(low[i],low[j]-limit);
      };
      if (col-direction>=0 && col-direction<=cols) near(i-direction,sx*grade);
      if (row-direction<0 || row-direction>rows) continue;
      const previousRow=i-stride*direction;
      near(previousRow,sz*grade);
      if (col>0) near(previousRow-1,diagonal);
      if (col<cols) near(previousRow+1,diagonal);
    }
  }
  const softened=heights.map((_,i)=>(high[i]+low[i])*.5);
  // Round the change in gradient at the ends of each blend as well.
  for (let i=0; i<heights.length; i++) {
    const col=i%stride, row=Math.floor(i/stride);
    if (!col || col===cols || !row || row===rows) heights[i]=softened[i];
    else heights[i]=(softened[i]*4+softened[i-1]+softened[i+1]+softened[i-stride]+softened[i+stride])/8;
  }
}

export function circuitTerrain({ arena, road, directions }, connector = []) {
  const cols = Math.ceil(arena.w);
  const rows = Math.ceil(arena.d);
  const x0 = arena.x - arena.w / 2;
  const z0 = arena.z - arena.d / 2;
  const sx = arena.w / cols;
  const sz = arena.d / rows;
  const stride = cols + 1;
  const heights = new Float32Array(stride * (rows + 1));
  const edgeDistance = new Float32Array(heights.length);
  const surface = new Float32Array(heights.length * 3);
  const grip = new Float32Array(heights.length);
  const vertices = new Float32Array(heights.length * 3);
  const indices = new Uint32Array(cols * rows * 6);
  const profiles = road.map((_, i) => {
    const phase = i / road.length;
    const t = phase * Math.PI * 2;
    const fade = smoothstep(Math.min(phase, 1 - phase), .065, .14);
    const before = directions[(i + road.length - 5) % road.length];
    const after = directions[(i + 5) % road.length];
    const d = directions[i];
    return {
      height: fade * (1.8 * (1 - Math.cos(t)) + 1.05 * Math.sin(2*t)),
      bank: fade * clamp((after.x-before.x)*d.z - (after.z-before.z)*d.x, -.63, .63) * .125,
    };
  });
  const branchStart = profiles[road.indexOf(connector[0])]?.height;
  const branchEnd = profiles[road.indexOf(connector.at(-1))]?.height;
  function rawHeight(x, z) {
    let best = Infinity;
    let height = 0;
    let roadSample = 0;
    for (let i=0; i<road.length; i++) {
      const j = (i + 1) % road.length;
      const a = road[i], b = road[j];
      const dx = b.x-a.x, dz = b.z-a.z;
      const fraction = clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
      const rx = x-a.x-dx*fraction, rz = z-a.z-dz*fraction;
      const distance = rx*rx+rz*rz;
      if (distance >= best) continue;
      best = distance;
      roadSample = i + fraction;
      const lateral = -rx*directions[i].z + rz*directions[i].x;
      height = lerp(profiles[i].height,profiles[j].height,fraction)
        + clamp(lateral,-9,9) * lerp(profiles[i].bank,profiles[j].bank,fraction);
    }
    const distance = Math.sqrt(best);
    let branchDistance = Infinity, branchProgress = 0, branchOffset = 0;
    for (let i=1; i<connector.length; i++) {
      const a=connector[i-1], b=connector[i];
      const dx=b.x-a.x, dz=b.z-a.z;
      const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
      const rx=x-a.x-t*dx, rz=z-a.z-t*dz;
      const distanceSquared=rx*rx+rz*rz;
      if (distanceSquared >= branchDistance) continue;
      branchDistance=distanceSquared;
      branchProgress=(i-1+t)/(connector.length-1);
      branchOffset=(rz*dx-rx*dz)/Math.hypot(dx,dz);
    }
    let surfaceHeight = height * (1-smoothstep(distance,8,25));
    const branch = Math.sqrt(branchDistance);
    if (branch < 15) {
      const t=branchProgress;
      const bank=Math.sin(2*Math.PI*t)*.055;
      const grade=lerp(branchStart,branchEnd,smoothstep(t,0,1)) + clamp(branchOffset,-8,8)*bank;
      const blend=(1-smoothstep(branch,7.9,15))*smoothstep(distance,3.5,8.2);
      surfaceHeight=lerp(surfaceHeight,grade,blend);
    }
    const asphaltDistance = Math.min(distance,branch);
    const onBranch = branch < distance;
    const sample = onBranch ? branchProgress*(connector.length-1) : roadSample;
    return [surfaceHeight,asphaltDistance,Math.sin(sample*Math.PI/2),Number(onBranch)];
  }
  let next = 0;
  for (let row=0; row<=rows; row++) {
    for (let col=0; col<=cols; col++) {
      const i = row*stride+col;
      const x = x0+col*sx, z = z0+row*sz;
      const [y,distance,curbPattern,branch] = rawHeight(x,z);
      edgeDistance[i] = distance;
      grip[i] = 1-.40*smoothstep(distance,7.65,11.4);
      heights[i] = y;
      surface.set([distance,curbPattern,branch],i*3);
      vertices.set([x,y,z],i*3);
      if (col < cols && row < rows) {
        indices.set([i,i+stride,i+1,i+1,i+stride,i+stride+1], next);
        next += 6;
      }
    }
  }
  if (connector.length) {
    softenJoins(heights,cols,rows,sx,sz);
    for (let i=0; i<heights.length; i++) vertices[i*3+1]=heights[i];
  }
  function interpolate(field,x,z) {
    const u = clamp((x-x0)/sx,0,cols), v = clamp((z-z0)/sz,0,rows);
    const col = Math.min(cols-1,Math.floor(u)), row = Math.min(rows-1,Math.floor(v));
    const a = u-col, b = v-row, i = row*stride+col;
    const h00 = field[i], h10 = field[i+1], h01 = field[i+stride], h11 = field[i+stride+1];
    return a+b <= 1 ? h00+(h10-h00)*a+(h01-h00)*b : h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
  }
  return { vertices, indices, surface,
    heightAt: (x,z) => interpolate(heights,x,z),
    gripAt: (x,z) => interpolate(grip,x,z),
    curbAt(x,z) {
      const distance = interpolate(edgeDistance,x,z);
      return distance>=7.82 && distance<=8.62;
    },
  };
}
