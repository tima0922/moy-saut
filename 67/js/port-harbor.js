import * as THREE from 'three';

export const HARBOR_WATER = -7.6;

const palette = {
  concrete:0x687373, coping:0xa8aba3, asphalt:0x3a454b, lines:0xc6b78a,
  warehouse:0x879398, industrial:0x6d7776, roof:0x4c595f, glass:0x425963,
  skyline:[0x687b87,0x839092,0x8c9596,0x667881], stripe:0xbc913b,
  steel:0x4c585c, hull:0x2b3d47, redHull:0x973f34, dredger:0x476c65,
  deck:0x798c82, white:0xd1d0bb, rubber:0x2d3438, surf:0x648d95,
  cargo:[0xa35b43,0x54808a,0xb6985f,0x657d6f,0x858e95],
};

function hullGeometry() {
  const ring=[[-.43,-.5],[.43,-.5],[.5,-.39],[.5,.25],[.32,.43],[0,.5],[-.32,.43],[-.5,.25],[-.5,-.39]];
  const vertices=[];
  for (let i=0;i<ring.length;i++) {
    const [x,z]=ring[i],[u,v]=ring[(i+1)%ring.length];
    vertices.push(x,.5,z,u,.5,v,u*.79,-.5,v*.92,x,.5,z,u*.79,-.5,v*.92,x*.79,-.5,z*.92);
    vertices.push(0,.5,0,u,.5,v,x,.5,z);
    vertices.push(0,-.5,0,x*.79,-.5,z*.92,u*.79,-.5,v*.92);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  return geometry;
}

export function harborScenery() {
  const boxGeometry = new THREE.BoxGeometry();
  const hull = hullGeometry();
  const material=new THREE.MeshStandardMaterial({roughness:.93});

  function createChunk(section,index) {
    const group=new THREE.Group();
    group.name='Harbor scenery';
    const boxes=[], ships=[];
    const origin=section.z;
    const base=-4.55;
    const zone=Math.floor(index/6);
    const box=(x,y,z,w,h,d,color,yaw=0,pitch=0)=>boxes.push({x,y,z,w,h,d,color,yaw,pitch});
    const shipHull=(x,y,z,w,h,d,color,yaw)=>ships.push({x,y,z,w,h,d,color,yaw,pitch:0});

    function vessel(x,z,{length,width,deck=-3.15,yaw=0,color=palette.hull,crossing=false,style='cargo',loaded=true}) {
      const cos=Math.cos(yaw),sin=Math.sin(yaw);
      const place=(u,y,v,w,h,d,paint)=>box(x+cos*u+sin*v,y,z-sin*u+cos*v,w,h,d,paint,yaw);
      shipHull(x,deck-2.14,z,width,4.15,length,color,yaw);
      shipHull(x,deck-3.95,z,width*.92,1,length*.97,palette.redHull,yaw);
      shipHull(x,deck-.08,z,width*.935,.22,length*.975,palette.deck,yaw);
      const stern=-length*.31;
      place(0,deck+1.27,stern,width*.74,2.5,length*.13,palette.white);
      place(0,deck+2.95,stern-length*.018,width*.82,1.15,length*.115,palette.white);
      place(0,deck+3.02,stern+length*.041,width*.74,.39,.065,palette.glass);
      for (const side of [-1,1]) {
        place(side*width*.416,deck+2.99,stern-length*.025,.06,.38,length*.072,palette.glass);
        place(side*width*.457,deck-.61,length*.005,.16,.44,length*.61,palette.rubber);
      }
      place(width*.21,deck+4.15,stern-length*.053,width*.12,1.55,length*.041,palette.steel);
      place(width*.21,deck+4.87,stern-length*.053,width*.13,.34,length*.043,palette.stripe);
      place(0,deck+4.66,stern+length*.017,.19,2.38,.18,palette.steel);
      place(0,deck+5.57,stern+length*.017,width*.27,.14,.15,palette.white);
      if (loaded) {
        const cells = crossing ? [-.11,.015] : [-.14,.045,.215];
        for (const [row,at] of cells.entries()) {
          if (style==='tanker') {
            place(0,deck+.72,length*at,width*.68,1.44,length*.14,palette.white);
            place(0,deck+1.53,length*at,width*.29,.27,length*.058,palette.steel);
            continue;
          }
          for (const side of [-1,1]) {
            const paint=palette.cargo[(index+row+(side>0?2:0))%palette.cargo.length];
            const column=side*width*.23;
            place(column,deck+1.14,length*at,width*.398,2.24,length*.15,paint);
            if ((index+row)%3!==1) place(column,deck+3.39,length*at,width*.385,2.25,length*.148,
              palette.cargo[(index+row+1)%palette.cargo.length]);
          }
        }
      }
      place(0,deck+.36,length*.36,width*.20,.56,length*.09,palette.steel);
    }

    function gantry(x,z) {
      for (const shift of [-7,7]) {
        box(x,base+9,z+shift,1.2,18,1.4,palette.steel);
        box(x,base+5.4,z+shift*.6,.78,13,.72,palette.stripe,0,shift<0 ? -.48 : .48);
        box(x+12,base+5.7,z+shift,1.05,11.4,1.35,palette.steel);
        box(x+6,base+12,z+shift,13.5,.9,.9,palette.stripe);
      }
      box(x-7,base+18,z,19,1.3,1.55,palette.stripe);
      box(x+3,base+18,z,1.2,1.3,15.35,palette.steel);
      box(x-14,base+14,z,.12,7, .12,palette.steel);
      box(x-14,base+10.4,z,.9,.62,.8,palette.stripe);
    }

    function warehouse(x,z,width,length,height,bottom=base,yaw=0) {
      const cos=Math.cos(yaw),sin=Math.sin(yaw);
      const part=(u,y,v,w,h,d,color,pitch=0)=>box(x+cos*u+sin*v,y,z-sin*u+cos*v,w,h,d,color,yaw,pitch);
      part(0,bottom+height/2,0,width,height,length,palette.warehouse);
      part(0,bottom+height+.045,0,width+.34,.12,length+.46,palette.roof);
      for (const v of [-.32,0,.32]) {
        part(-width*.5-.025,bottom+height*.33,length*v,.12,height*.54,length*.20,palette.industrial);
        part(-width*.5-.08,bottom+height*.78,length*v,.08,.56,length*.22,palette.glass);
      }
      for (const side of [-1,1]) part(side*width*.44,bottom+height-.36,0,.13,.18,length,palette.steel);
    }

    // Continuous quay and access roads on the city side, water on the seaward side.
    box(78,base-1.8,origin+77,106,3.6,154,palette.concrete);
    box(25.22,base+.035,origin+77,1.18,.21,154,palette.coping);
    box(40,base+.028,origin+77,9,.065,154,palette.asphalt);
    for (const along of [11,35,59,83,107,131]) {
      box(40,base+.072,origin+along,.13,.018,8.5,palette.lines);
      box(24.88,base+.34,origin+along,1.05,.6,.73,palette.steel);
      box(24.81,base+.68,origin+along,.59,.15,1.04,palette.stripe);
      box(24.38,HARBOR_WATER+1.46,origin+along,.43,2.12,1.16,palette.rubber);
    }
    if (index===0) {
      box(77,base-1.8,origin-26,104,3.6,52,palette.concrete);
      box(-24,base-1.8,origin-16,48,3.6,32,palette.concrete);
    }

    for (let i=0;i<3;i++) {
      const z=origin+18+i*48+(index%3)*3;
      const x=zone===2 || zone===4 ? 64+i%2*10 : 79+i%2*15;
      const width=13+(i+index)%4*3;
      const height=zone===2 || zone===4 ? 18+(i*11+index*7)%30 : 11+(i*9+index*7)%24;
      const depth=18+(i+index)%3*4;
      box(x,base+height/2,z,width,height,depth,palette.skyline[(index+i)%4]);
      box(x+1,base+height+.65,z-1,width*.57,1.35,depth*.62,palette.roof);
      for (let level=3;level<height-1;level+=4.25) {
        box(x-width/2-.025,base+level,z,.08,1.12,depth*.8,palette.glass);
        box(x,base+level,z-depth/2-.025,width*.8,1.12,.08,palette.glass);
      }
    }
    if (zone===0 || zone===3 || zone===4) {
      warehouse(55,origin+100,16,44,8.2+(index%3)*1.3);
    } else {
      for (let i=0;i<5;i++) {
        const x=49+i%2*4,z=origin+46+14*Math.floor(i/2);
        box(x,base+1.28,z,3.48,2.55,12,palette.cargo[(index+i)%5]);
        if ((index+i)%3!==0) box(x,base+3.83,z,3.4,2.55,11.7,palette.cargo[(index+i+2)%5]);
      }
    }

    if (index===0 || zone===1 || zone===3 || index%5===3) gantry(28.3,origin+41);
    if (!section.ship && index!==29 && (index%3!==1 || index===1)) vessel(-23-(index%3)*5,origin+(index===0?57:116),{
      length: index===0 ? 92 : 63+(index%4)*7,width: index===0 ? 14 : 11.5+(index%3),
      yaw:index%4===1 ? -.11 : .05,color:zone===3?palette.dredger:palette.hull,style:zone===3?'tanker':'cargo',
    });
    if (zone===1 || zone===5) {
      box(-78,base-1.65,origin+77,18,3.3,154,palette.concrete);
      box(-68.85,base+.05,origin+77,.68,.28,154,palette.coping);
      if (index%2===0) vessel(-59,origin+34,{length:48,width:10.7,color:palette.dredger,style:'tanker'});
    }

    for (const jump of section.jumps ?? []) {
      if (!section.ship) break;
      const [,lip,gap]=jump;
      const z=origin+lip+gap*.5;
      vessel(section.x-23,z,{length:66,width:gap-.9,deck:-3.9,yaw:Math.PI/2,crossing:true});
    }
    if (index===29) vessel(-17,origin+82,{length:69,width:14.5,deck:-3.9,yaw:Math.PI/2,crossing:true});
    for (const {x,x1=x,a,b,w,y0,surface} of section.decks) {
      const length=Math.hypot(x1-x,b-a),yaw=Math.atan2(x1-x,b-a);
      if (surface==='roof') {
        warehouse((x+x1)/2,(a+b)/2,w-.04,length-.32,y0-.95-base,base,yaw);
      } else if (surface==='barge') {
        shipHull((x+x1)/2,y0-2.4,(a+b)/2,w+.46,3.4,length+1,palette.hull,yaw);
        shipHull((x+x1)/2,HARBOR_WATER+.45,(a+b)/2,w*.87,2,length*.93,palette.redHull,yaw);
        box((x+x1)/2,y0-3.6,(a+b)/2,w*.93,4,length*.63,palette.hull,yaw);
      }
    }

    const dummy=new THREE.Object3D(), color=new THREE.Color();
    for (const [geometry,items] of [[boxGeometry,boxes],[hull,ships]]) {
      if (!items.length) continue;
      const mesh=new THREE.InstancedMesh(geometry,material,items.length);
      for (const [i,item] of items.entries()) {
        const {x,y,z,w,h,d,yaw,pitch}=item;
        dummy.position.set(x,y,z);
        dummy.rotation.set(pitch,yaw,0,'YXZ');
        dummy.scale.set(w,h,d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,color.setHex(item.color));
      }
      group.add(mesh);
    }
    return group;
  }
  return {createChunk};
}
