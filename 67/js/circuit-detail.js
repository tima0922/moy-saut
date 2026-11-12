import { CanvasTexture, Vector4 } from 'three';

const { sin, cos, atan2, PI } = Math;

// RGB stores repairs, deposited rubber and paint wear on the same terrain UVs.
export function makeCircuitDetails(layout, connector, branchDirections) {
  const { road, directions, arena } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.globalCompositeOperation = 'lighten';
  const scaleX=canvas.width/arena.w, scaleZ=canvas.height/arena.d;
  ctx.setTransform(scaleX,0,0,scaleZ,(arena.w/2-arena.x)*scaleX,(arena.d/2-arena.z)*scaleZ);

  function patch(p,d,length,width,offset,seed) {
    ctx.save();
    ctx.translate(p.x-d.z*offset,p.z+d.x*offset);
    ctx.rotate(atan2(d.z,d.x));
    const x=length/2, z=width/2;
    ctx.beginPath();
    ctx.moveTo(-x,-z*.76);
    ctx.lineTo(-x*.53,-z);
    ctx.lineTo(x*.74,-z*.89);
    ctx.lineTo(x,-z*.47);
    ctx.lineTo(x*.91,z*.85);
    ctx.lineTo(x*.24,z);
    ctx.lineTo(-x*.76,z*.88);
    ctx.closePath();
    ctx.fillStyle = `rgb(${89+seed*11},0,0)`;
    ctx.fill();
    ctx.strokeStyle = 'rgb(159,0,0)';
    ctx.lineWidth = .10;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-x*.7,-z*.58);
    ctx.lineTo(-x*.37,-z*.18);
    ctx.lineTo(-x*.08,-z*.37);
    ctx.lineTo(x*.18,z*.08);
    ctx.strokeStyle = 'rgb(205,0,0)';
    ctx.lineWidth = .075;
    ctx.stroke();
    ctx.restore();
  }
  for (const [i,length,width,offset,seed] of [[14,11,2.6,-3,0],[38,6,3.8,3,3],[61,8,3.2,-2.1,1],
    [85,6,4.7,1.7,2],[114,8,3.1,-3,4],[139,10,2.6,2.7,1],[176,6,2.3,-4.2,1],
    [181,9,2.4,-3,2],[208,6,3.4,3,3],[232,8,4.1,-2,1],[249,5.5,3.2,1.5,4]]) {
    patch(road[i],directions[i],length,width,offset,seed);
  }
  patch(connector[12],branchDirections[12],8,3.6,-1.8,3);
  patch(connector[19],branchDirections[19],5,2.1,2.8,1);

  function depositRubber(samples,tangents,start,end,approach,apex,exit,seed) {
    const count=end-start;
    for (const axleMark of [-.71,.71]) {
      let last;
      for (let j=0;j<=count;j++) {
        const i=start+j, p=samples[i], d=tangents[i], t=j/count;
        const exitBlend=t*t*(3-2*t);
        const offset=approach*(1-exitBlend)+exit*exitBlend+apex*sin(PI*t)**2+axleMark+.23*sin(i*.54+seed);
        const point={ x:p.x-d.z*offset,z:p.z+d.x*offset };
        if (last) {
          const intensity=Math.round(148*sin(PI*(j-.5)/count)**.58*(.86+.14*cos(i*.7+seed)));
          ctx.beginPath();
          ctx.moveTo(last.x,last.z);
          ctx.lineTo(point.x,point.z);
          ctx.strokeStyle = `rgb(0,${Math.round(intensity*.52)},0)`;
          ctx.lineWidth = .79;
          ctx.stroke();
          ctx.strokeStyle = `rgb(0,${intensity},0)`;
          ctx.lineWidth = .32+.1*sin(i*.75);
          ctx.stroke();
        }
        last=point;
      }
    }
  }
  ctx.lineCap = 'round';
  for (const lane of [[34,68,-3,4.6,-1,0],[70,102,2,-4,-2,1],[104,128,-2,4.2,1,2],
    [135,174,-3,6,-2,3],[182,216,2,-4.5,2,4],[216,244,-2.7,5,-.5,5]]) {
    depositRubber(road,directions,...lane);
  }
  depositRubber(connector,branchDirections,2,22,-2.5,4.6,-1.4,6);

  function scuff(samples,tangents) {
    for (const [i,p] of samples.entries()) {
      if ((i*13)%29 > 11) continue;
      const d=tangents[i], side=i%3 ? 1 : -1;
      ctx.save();
      ctx.translate(p.x-d.z*side*7.93,p.z+d.x*side*7.93);
      ctx.rotate(atan2(d.z,d.x));
      ctx.fillStyle = `rgb(0,0,${76+(i*47)%140})`;
      ctx.beginPath();
      ctx.ellipse(0,0,.55+(i%5)*.24,.22+(i%4)*.09,.17,0,2*PI);
      ctx.fill();
      ctx.restore();
    }
  }
  scuff(road,directions);
  scuff(connector,branchDirections);

  return {
    map:new CanvasTexture(canvas),
    bounds:new Vector4(arena.x-arena.w/2,arena.z+arena.d/2,1/arena.w,1/arena.d),
  };
}
