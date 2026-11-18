import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchSharedMeshes } from './garage-visuals.js';
import { createTireEffects } from './drift-world.js?v=032';
export { createCityLayout } from './city-layout.js?v=032';

function facade(style) {
  const canvas=document.createElement('canvas');
  canvas.width=128;
  canvas.height=256;
  const ctx=canvas.getContext('2d');
  const palettes=[
    ['#385665','#233c50','#86b0ba','#ffc78c','#172d3b'],
    ['#8a6456','#654f49','#949fa6','#f9c78f','#342f39'],
    ['#69727b','#4c5764','#91abb5','#f4dfab','#354456'],
  ];
  const [wall,frame,glass,warm,dark]=palettes[style];
  ctx.fillStyle=wall;
  ctx.fillRect(0,0,128,256);
  for (let y=0;y<12;y++) for (let x=0;x<6;x++) {
    const roll=(x*31+y*17+x*y*11+style*3)%13;
    const px=2+x*21,py=4+y*21;
    ctx.fillStyle=frame;
    ctx.fillRect(px,py,18,16);
    ctx.fillStyle=roll<4?warm:roll<9?glass:dark;
    ctx.fillRect(px+2,py+2,14,11);
    ctx.fillStyle=wall;
    ctx.fillRect(px+9,py+2,1,11);
    if (style===1) {
      ctx.fillStyle='#b89b84';
      ctx.fillRect(px-1,py+15,20,2);
    }
  }
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({map});
}

export function createCityWorld(world,layout,asphaltSource) {
  const group=new THREE.Group();
  const chunks=new Map();
  const {road,directions,widths,bank,spacing}=layout;
  const count=road.length;
  const obstacles=[];
  const matte=color=>new THREE.MeshLambertMaterial({color});
  const lit=color=>new THREE.MeshBasicMaterial({color});
  const stone=matte(0x81939c), concrete=matte(0x5a6b74), ink=matte(0x233240);
  const steel=matte(0x334958), metal=matte(0x657d87);
  const rust=matte(0x9b5142), chalk=matte(0xe6e5d9);
  const orange=lit(0xffcc91), cream=lit(0xf9efcf), blue=lit(0x92e9e3);
  const paints=[0,1,2].map(facade);
  function chunkAt(x,z) {
    const key=Math.floor(x/70)+','+Math.floor(z/70);
    if (!chunks.has(key)) {
      const chunk=new THREE.Group();
      chunks.set(key,chunk);
      group.add(chunk);
    }
    return chunks.get(key);
  }
  function box(x,y,z,w,h,d,paint,yaw=0,solid=false,pitch=0) {
    const mesh=world.box(chunkAt(x,z),[w,h,d],[x,y,z],paint,[pitch,yaw,0,'YXZ']);
    mesh.castShadow=false;
    if (solid) obstacles.push({x,z,w,h,d,y:y-h/2,yaw,pitch});
    return mesh;
  }
  function at(i,offset=0,raise=0) {
    const index=(i+count)%count,p=road[index],t=directions[index];
    return {x:p.x+t.z*offset,y:p.y+bank[index]*offset+raise,z:p.z-t.x*offset};
  }
  function ribbon(start,end,left,right,raise,material,collidable=false) {
    const positions=[],uv=[],indices=[];
    for (let i=start;i<=end;i++) {
      const w=widths[i%count];
      for (const edge of [left(w),right(w)]) {
        const p=at(i,edge,raise);
        positions.push(p.x,p.y,p.z);
        uv.push(edge/9,i*spacing/9);
      }
      if (i>start) {
        const a=(i-start-1)*2;
        indices.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    if (!material) return geometry;
    const mesh=new THREE.Mesh(geometry,material);
    mesh.receiveShadow=true;
    group.add(mesh);
    if (collidable) obstacles.push({vertices:new Float32Array(positions),indices:new Uint32Array(indices),drivable:true});
  }
  function beam(a,b,width,paint,solid=false) {
    const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
    box((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,width,width,Math.hypot(dx,dy,dz)+(solid ? .23 : 0),
      paint,Math.atan2(dx,dz),solid,-Math.atan2(dy,Math.hypot(dx,dz)));
  }
  const asphaltMap=asphaltSource.map.clone();
  asphaltMap.repeat.set(1,1);
  const asphalt=new THREE.MeshLambertMaterial({color:0x7a8690,map:asphaltMap});
  for (let start=0;start<count;start+=48) {
    const end=start+48;
    ribbon(start,end,w=>-w-1.35,w=>w+1.35,-.035,concrete);
    ribbon(start,end,w=>-w,w=>w,0,asphalt,true);
    for (const side of [-1,1]) {
      ribbon(start,end,w=>side*(w-.38)-.08,w=>side*(w-.38)+.08,.017,chalk);
    }
  }
  for (let start=0;start<count;start+=45) {
    const dashes=[];
    for (let i=start;i<Math.min(start+45,count);i+=5) dashes.push(ribbon(i,i+2,()=>-.058,()=>.058,.018));
    const mesh=new THREE.Mesh(mergeGeometries(dashes),chalk);
    group.add(mesh);
    dashes.forEach(geometry=>geometry.dispose());
  }

  // Physical barriers follow the same banking and elevation as the road deck.
  for (const side of [-1,1]) for (let i=0;i<count;i+=4) {
    const a=at(i,side*(widths[i]+.73),.48);
    const b=at(i+4,side*(widths[(i+4)%count]+.73),.48);
    beam(a,b,.92,i%24<4?chalk:stone,true);
    const elevated=road[i].y>1.25;
    if (elevated || i%12===0) {
      a.y+=.67;b.y+=.67;
      beam(a,b,.12,elevated ? blue : metal);
    }
  }

  const dry=matte(0x647376);
  const water=matte(0x355d73);
  const land = (x,z,w,d)=>box(x,-.28,z,w,.32,d,dry,0,true);
  // The river is open under the elevated deck.
  land(-65,908,534,458);
  obstacles.at(-1).drivable=true;
  land(251,754,102,150);
  obstacles.at(-1).drivable=true;
  land(251,1092,102,114);
  obstacles.at(-1).drivable=true;
  box(302,-1.4,941,208,.24,267,water);
  for (let i=0;i<22;i++) {
    const line=box(217+(i*29)%147,-1.267,830+(i*47)%221,4+(i*11)%22,.011,.09,concrete);
    line.receiveShadow=false;
  }

  for (let i=4;i<count;i+=16) {
    const side=i%32<16 ? -1 : 1;
    const p=at(i,side*(widths[i]+2.3));
    const arm=at(i,side*(widths[i]+1.48),5.03);
    const yaw=Math.atan2(directions[i].x,directions[i].z);
    box(p.x,p.y+2.55,p.z,.16,5.2,.16,steel,yaw,true);
    box(arm.x,arm.y,arm.z,1.85,.14,.24,steel,yaw);
    box(arm.x,arm.y-.1,arm.z,.58,.07,.24,orange,yaw);
  }

  const clearAt=(x,z,r)=>!road.some((p,i)=>(p.x-x)**2+(p.z-z)**2<(widths[i]+r)**2);
  let serial=0;
  for (let z=703;z<=1133;z+=29) for (let x=-302;x<=203;x+=29) {
    const n=++serial,w=15+n*11%9,d=15+n*7%8;
    if (!clearAt(x,z,Math.hypot(w,d)/2+5)) continue;
    const market=z>995 && x<100;
    const start=z<762 && x>-147 && x<145;
    const h=market ? 9+n*13%7 : start ? 17+n*7%15 : 19+n*19%35;
    box(x,h/2,z,w,h,d,paints[market?1:n%3],0,true);
    box(x,h+.15,z,w+.60,.3,d+.60,metal);
    box(x-1,h+1.1,z,w*.48,1.85,d*.49,steel);
    if (market) {
      box(x,2.1,z-d/2-.08,w*.90,3.3,.19,ink);
      box(x,3.55,z-d/2-.70,w*.93,.27,1.8,n%2?rust:steel);
      box(x,3.32,z-d/2-1.49,w*.91,.07,.13,orange);
    } else if (n%5===0) {
      box(x,h+2.75,z,w*.61,5.2,d*.62,paints[n%3]);
      box(x,h+5.45,z,w*.64,.21,d*.66,blue);
    }
  }

  // Cable towers and their road clearance are tied to the bridge section.
  const bridgePoints=road.map((p,i)=>({p,i})).filter(({p})=>p.y>5 && p.x>220);
  for (const item of [bridgePoints[9],bridgePoints.at(-10)]) {
    const {i}=item;
    const pillars=[-1,1].map(side=>at(i,side*(widths[i]+2.1)));
    for (const p of pillars) {
      box(p.x,(p.y+14.7)/2,p.z,1.25,p.y+18.7,1.3,steel,0,true);
      for (const shift of [-30,-18,18,30]) {
        const base=at(i+shift,Math.sign((p.x-road[i].x)*directions[i].z-(p.z-road[i].z)*directions[i].x)*(widths[(i+shift+count)%count]+.81),1.5);
        beam({...p,y:p.y+15},base,.115,metal);
      }
    }
    beam({...pillars[0],y:pillars[0].y+12},{...pillars[1],y:pillars[1].y+12},.6,blue);
  }

  // The station canopy is built from short spans so the exit opens gradually.
  const station=road.map((p,i)=>({p,i})).filter(({p})=>p.x<-246 && p.z>810 && p.z<857);
  for (const {i} of station.filter((_,n)=>n%4===0)) {
    const p=road[i],yaw=Math.atan2(directions[i].x,directions[i].z);
    box(p.x,p.y+6.9,p.z,2*widths[i]+4,1.65,spacing*4+.8,concrete,yaw);
    for (const side of [-1,1]) {
      const s=at(i,side*(widths[i]-1.7),5.98);
      box(s.x,s.y,s.z,.19,.12,spacing*3.75,side<0?orange:cream,yaw);
      const support=at(i,side*(widths[i]+1.8));
      box(support.x,support.y+3.15,support.z,.53,6.4,.85,metal,yaw,true);
    }
  }

  function sign(index,text,side=1,w=5) {
    const i=(index+count)%count;
    const p=at(i,side*(widths[i]+3.7),2.25);
    const yaw=Math.atan2(directions[i].x,directions[i].z);
    box(p.x,p.y-1.12,p.z,.14,2.5,.17,steel,yaw,true);
    box(p.x,p.y+.17,p.z,w,.88,.12,ink,yaw);
    world.textPlane(chunkAt(p.x,p.z),text,w,.86,
      [p.x-.075*Math.sin(yaw),p.y+.17,p.z-.075*Math.cos(yaw)],[0,yaw+Math.PI,0],'#ffdd9f','#1e303c');
  }
  for (const {i,name} of layout.sections.slice(1)) sign(i-12,name.toUpperCase(),1,5.9);
  for (const {i,angle,speed} of layout.corners) {
    const side=Math.sign(angle);
    sign(i-Math.round(55/spacing),`55 М   ${speed} КМ/Ч`,side,3.8);
    for (const offset of [-8,-4,0,4]) {
      const index=(i+offset+count)%count,w=widths[index],p=at(index,side*(w+1.33),1.48);
      const t=directions[index];
      const yaw=Math.atan2(t.x,t.z);
      box(p.x,p.y,p.z,1.6,.64,.09,ink,yaw);
      for (const slope of [-1,1]) {
        const shift=.17*side;
        const x=p.x+t.z*shift,z=p.z-t.x*shift;
        const arrow=world.box(chunkAt(x,z),[.48,.095,.025],[x-t.x*.065,p.y+slope*.13,z-t.z*.065],
          orange,[0,yaw,-slope*side*.55,'YXZ']);
        arrow.castShadow=false;
      }
    }
  }

  // Ship moored beyond the bridge and tiered spectator stands on the start straight.
  box(287,-.48,932,15,2.4,54,ink);
  box(287,1.08,936,13,1.6,42,chalk);
  box(287,2.67,943,11,1.65,24,metal);
  box(287,4.0,946,8,1.01,13,stone);
  box(287,4.8,944,7,.16,11,blue);
  for (const x of [-92,-53,7]) {
    for (let row=0;row<5;row++) box(x,(row+1)*.33,756+row*.94,26,(row+1)*.66,.94,row%2?chalk:steel);
    box(x,6.25,760,27,.43,7,steel);
    for (const side of [-1,1]) box(x+side*12.6,3,761,.33,6.1,.33,steel,0,true);
    box(x,6.48,756.71,26,.14,.1,blue);
  }

  for (const chunk of chunks.values()) batchSharedMeshes(chunk);
  return {group,obstacles,fx:createTireEffects(group),markGate() {}};
}
