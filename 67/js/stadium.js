import * as THREE from 'three';
import { createTireEffects } from './drift-world.js?v=034';
import { batchSharedMeshes } from './garage-visuals.js';
import { STADIUM,RADIUS,HALF_WIDTH,OVAL_LENGTH,INFIELD_HALF,ovalPoint,infieldPoint } from './stadium-layout.js?v=034';

export { STADIUM,RADIUS,HALF_WIDTH,createStadiumLayout,stadiumSurface } from './stadium-layout.js?v=034';

export function createStadiumWorld(world,asphaltSource) {
  const {x,z,w,d} = STADIUM;
  const group = new THREE.Group();
  world.scene.add(group);
  group.visible = false;
  const obstacles = [];
  const material = color => new THREE.MeshStandardMaterial({color,roughness:1});
  const grass = material(0xffffff);
  const stripes = new Uint8Array(32*4);
  for (let i=0;i<32;i++) stripes.set(i<16 ? [86,113,66,255] : [97,125,74,255],i*4);
  grass.map = new THREE.DataTexture(stripes,32,1);
  grass.map.colorSpace = THREE.SRGBColorSpace;
  grass.map.wrapS = THREE.RepeatWrapping;
  grass.map.repeat.set(w/11,1);
  grass.map.generateMipmaps = true;
  grass.map.minFilter = THREE.LinearMipmapLinearFilter;
  grass.map.magFilter = THREE.LinearFilter;
  grass.map.needsUpdate = true;
  const asphalt = material(0x767d84), runoff = material(0x697472), concrete = material(0x919c9f);
  asphalt.map = asphaltSource.map?.clone() ?? null;
  asphalt.map?.repeat.set(1,1);
  const red = material(0xce6244), white = material(0xe8e7dd), wall = material(0x58686e);
  const navy = material(0x274754), seat = material(0x458a91), amber = material(0xd49751);
  const darkPaint = material(0x414b50);

  function plane(width,depth,bx,bz,y,paint) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width,depth),paint);
    mesh.rotation.x = -Math.PI/2;
    mesh.position.set(bx,y,bz);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  function strip(name,paint,y,sections) {
    const positions=[], uv=[], indices=[];
    for (const {start,end,steps,point,left,right} of sections) {
      const first=positions.length/3;
      for (let step=0;step<=steps;step++) {
        const t=THREE.MathUtils.lerp(start,end,step/steps);
        for (const offset of [left,right]) {
          const p=point(t,offset);
          positions.push(p.x,y,p.z);
          uv.push(p.x/11,p.z/11);
        }
        if (step) {
          const a=first+2*(step-1);
          indices.push(a,a+2,a+1,a+1,a+2,a+3);
        }
      }
    }
    if (!indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry,paint);
    mesh.name=name;
    mesh.receiveShadow=true;
    group.add(mesh);
  }

  function oval(left,right,start=0,end=OVAL_LENGTH,steps=320) {
    return {start,end,steps,point:ovalPoint,left,right};
  }
  function connector(left,right,start=-RADIUS,end=RADIUS,steps=48) {
    return {start:z+start,end:z+end,steps,point:infieldPoint,left,right};
  }
  function box(bx,bz,width,depth,height,paint,{y=0,yaw=0,collide=false}={}) {
    const mesh=world.box(group,[width,height,depth],[bx,y+height/2,bz],paint,[0,yaw,0]);
    mesh.castShadow=false;
    if (collide) obstacles.push({x:bx,z:bz,w:width,d:depth,h:height,y,yaw});
    return mesh;
  }
  function sign(label,width,bx,bz,y,direction) {
    world.textPlane(group,label,width,.72,[bx,y,bz],[0,direction,0],'#f9efdc','#254651');
  }

  plane(w,d,x,z,.004,grass);
  strip('Oval apron',runoff,.011,[oval(-HALF_WIDTH-2.4,HALF_WIDTH+7)]);
  strip('Infield asphalt',asphalt,.018,[connector(-INFIELD_HALF,INFIELD_HALF)]);
  strip('Oval asphalt',asphalt,.019,[oval(-HALF_WIDTH,HALF_WIDTH)]);
  const curbs=[[],[]];
  const curbCount=144;
  for (let i=0;i<curbCount;i++) {
    const start=i*OVAL_LENGTH/curbCount,end=(i+1)*OVAL_LENGTH/curbCount;
    for (const edge of [HALF_WIDTH,-HALF_WIDTH]) {
      const center=ovalPoint((start+end)/2,edge);
      const entry = infieldPoint(center.z);
      if (edge<0 && Math.abs(center.x-entry.x)<INFIELD_HALF+4.5) continue;
      curbs[i%2].push(oval(edge-.28,edge+.28,start,end,3));
    }
  }
  strip('White kerbs',white,.026,curbs[0]);
  strip('Orange kerbs',red,.026,curbs[1]);
  strip('Infield edge paint',white,.026,[-5.7,5.7].map(offset=>connector(offset-.08,offset+.08,-RADIUS+10,RADIUS-10)));
  const centerLines=[];
  for (let t=-RADIUS+12;t<RADIUS-13;t+=9) centerLines.push(connector(-.11,.11,t,t+4,3));
  strip('Infield lane paint',amber,.027,centerLines);

  // Rail pieces come from the same outline as the asphalt; the infield entries stay open.
  const railCount=128;
  for (let i=0;i<railCount;i++) {
    const a=ovalPoint(i*OVAL_LENGTH/railCount,HALF_WIDTH+6.4);
    const b=ovalPoint((i+1)*OVAL_LENGTH/railCount,HALF_WIDTH+6.4);
    const yaw=-Math.atan2(b.z-a.z,b.x-a.x);
    const bx=(a.x+b.x)/2,bz=(a.z+b.z)/2;
    const length=Math.hypot(a.x-b.x,a.z-b.z)+.05;
    box(bx,bz,length,.58,1.08,wall,{yaw,collide:true});
    box(bx,bz,length,.60,.13,i%8<2 ? red : white,{y:.86,yaw});
  }
  const start=ovalPoint(0);
  for (let row=0;row<2;row++) {
    for (let cell=0;cell<20;cell++) box(start.x+(row-.5)*.8,start.z+cell-9.5,.8,1,.01,(row+cell)%2 ? darkPaint : white,{y:.025});
  }

  for (const side of [-1,1]) {
    for (const offset of [-98,-46,46,98]) {
      const bz=z+side*(RADIUS+27);
      box(offset,bz,46,11,.8,concrete,{collide:true});
      for (let row=0;row<7;row++) {
        box(offset,bz+side*(row-3)*1.18,44,1.18,.9+row*.44,row%3===0 ? navy : seat);
      }
      for (const end of [-19,19]) box(offset+end,bz+side*4,.32,.32,6.7,wall);
      box(offset,bz+side*2,46,8,.26,navy,{y:6.45});
      box(offset,bz-side*2.1,46,.18,.25,amber,{y:6.45});
    }
  }
  for (const bx of [-175,175]) for (const side of [-1,1]) {
    const bz=z+side*49;
    box(bx,bz,2.1,2.1,.38,concrete,{collide:true});
    box(bx,bz,.42,.42,13,wall,{collide:true});
    box(bx,bz,4.9,.7,.66,navy,{y:12.7});
    for (const dx of [-1.65,0,1.65]) box(bx+dx,bz-side*.42,1.06,.24,.39,white,{y:12.84});
  }

  for (const bx of [-77,77]) {
    for (const side of [-1,1]) {
      box(bx,z+side*39,94,.17,.006,white,{y:.008});
      box(bx+side*47,z,.17,78,.006,white,{y:.008});
    }
  }
  const paddockZ=z-38;
  box(72,paddockZ,44,13,4.2,navy,{collide:true});
  box(72,paddockZ,46,15,.27,concrete,{y:4.2});
  for (const bx of [56,64,72,80,88]) box(bx,paddockZ+6.54,6.4,.13,2.7,darkPaint,{y:.25});
  sign('ПАДДОК  /  67',12,72,paddockZ+6.63,3.64,0);
  for (const side of [-1,1]) {
    const bz=z+side*(RADIUS-12.6);
    for (const bx of [-24,24]) {
      box(bx,bz,8,.28,1.62,navy,{collide:true});
      sign('ПРОЕЗД  67',7.65,bx,bz+side*.16,1.14,side<0 ? Math.PI : 0);
    }
  }
  const bannerX=start.x+20;
  box(bannerX,start.z-13.1,1,1,6.5,navy,{collide:true});
  box(bannerX,start.z+13.1,1,1,6.5,navy,{collide:true});
  box(bannerX,start.z,.62,27,1.4,navy,{y:5.1,collide:true});
  sign('КОНТУР 67   /   ОВАЛ',23,bannerX-.33,start.z,5.83,-Math.PI/2);

  batchSharedMeshes(group);
  return {group,obstacles,fx:createTireEffects(group),makeGuestEffects:() => createTireEffects(group),markGate() {}};
}
