import * as THREE from 'three';

function texture(kind) {
  const side = 128;
  const data = new Uint8Array(side*side*4);
  const tau = 2*Math.PI;
  let random = 9387;
  for (let y=0;y<side;y++) for (let x=0;x<side;x++) {
    random = (Math.imul(random,1664525)+1013904223)>>>0;
    const noise = (random>>>24)/255-.5;
    let r,g,b;
    if (kind==='water') {
      const u=x/side*tau,v=y/side*tau;
      const wave=Math.sin(8*v+2*Math.sin(3*u))+Math.sin(5*v-4*u+.8*Math.sin(2*v));
      const shimmer=Math.max(0,wave-.88)*19;
      r=42+wave*3+shimmer+noise*3;
      g=82+wave*4+shimmer+noise*4;
      b=95+wave*5+shimmer+noise*4;
    } else {
      const u=x/side*tau,v=y/side*tau;
      const dark=Math.sin(3*u+Math.sin(v))*Math.sin(2*v+Math.cos(u))*8;
      const pitting=noise> .49 ? -28 : noise*18;
      r=109+dark+pitting;g=109+dark+pitting;b=105+dark+pitting;
    }
    data.set([r,g,b,255],(y*side+x)*4);
  }
  const map=new THREE.DataTexture(data,side,side,THREE.RGBAFormat);
  map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;
  map.needsUpdate=true;
  return map;
}

export function dockMaterials() {
  const paint=(color,roughness=.88)=>new THREE.MeshStandardMaterial({color,roughness});
  const water=texture('water');
  const concrete=texture('concrete');
  concrete.repeat.set(.25,.25);
  const deck=new THREE.MeshStandardMaterial({map:concrete,color:0xdedfd8,roughness:.93});
  return {
    water,deck,
    concrete:paint(0x7d807b),steel:paint(0x4c585d),black:paint(0x253138),
    stripe:paint(0xd5a64f),canopy:paint(0x8b9085),red:paint(0x884d3b),
    teal:paint(0x356d68),blue:paint(0x405d79),silver:paint(0xaca99a),
    window:paint(0x44626c,.4),rubber:paint(0x242627),
    lamp:new THREE.MeshBasicMaterial({color:0xffe6b8}),
  };
}

export function addDockScenery(block,section,index,materials) {
  const {steel,black,stripe,canopy,red,teal,blue,silver,window,rubber,lamp,concrete}=materials;
  const palette=[red,teal,blue,silver];
  const along=section.z;
  function container(x,y,z,color,length=11.7) {
    block(x,y,z,3.05,2.55,length,color);
    for (const edge of [-1,1]) {
      block(x+edge*1.49,y+1.25,z,.09,.11,length,steel);
      block(x+edge*1.49,y-1.25,z,.09,.11,length,steel);
      for (let i=-4;i<=4;i++) block(x+edge*1.535,y,z+i*length/10,.065,2.32,.14,color);
    }
    for (const end of [-1,1]) for (const offset of [-.48,.48]) block(x+offset,y,z+end*(length*.5+.03),.045,2.21,.08,steel);
  }

  function crane(x,z,direction) {
    for (const shift of [-6.8,6.8]) {
      block(x,7.5,z+shift,1.65,18,1.35,steel);
      block(x,5,z+shift*.57,.95,15,.75,stripe,shift<0 ? -.52 : .52);
      block(x,7.9,z+shift,1.67,1.65,1.4,stripe);
    }
    block(x,16.2,z,2.1,1.35,17.5,steel);
    block(x+direction*5,17,z,13,1.25,1.25,stripe);
    block(x+direction*10.6,14.7,z,2.25,2.65,1.85,concrete);
    block(x+direction*10.6,15.15,z-.95,1.75,1.25,.045,window);
    for (const side of [-1,1]) {
      block(x+direction*7.3,12.2,z+side*.33,.063,8.5,.063,black);
      block(x+direction*7.3,7.8,z+side*.33,.23,.45,.21,stripe);
    }
  }

  function warehouse(side,z) {
    const x=side*38;
    block(x,1.1,z,15,8.9,34,canopy);
    block(x,5.62,z,15.8,.24,35.1,steel);
    for (const pos of [-12,0,12]) {
      block(x-side*7.54,-.2,z+pos,.09,4.6,7.9,steel);
      block(x-side*7.59,3.38,z+pos,.06,1.2,6.5,window);
    }
    block(x-side*7.45,2.5,z,.21,.24,33,stripe);
  }

  function storageBarge(x,z,baseY=-1.35,length=44,width=9) {
    // Hull, deck edge and tapered bow use one shared palette and cheap box geometry.
    block(x,baseY-1,z,width,2.7,length-8,black);
    const tip=z+length*.5-5.4;
    block(x,baseY-.82,tip,width*.72,2.44,3.35,black);
    block(x,baseY-.76,tip+2.32,width*.36,2.28,1.3,black);
    block(x,baseY+.32,z,width,.24,length-8,steel);
    for (const side of [-1,1]) {
      block(x+side*(width*.5+.025),baseY-.23,z,.09,.24,length-8,red);
      for (const d of [-12,-4,4,12]) block(x+side*(width*.5+.09),baseY-.55,z+d,.28,.84,.75,rubber);
    }
  }

  const waterside = [6,7,10,12,15,17,21,24,28,29].includes(index);
  const siding = index%2===0 ? 1 : -1;
  for (const side of [-1,1]) {
    block(side*49,-4.22,along+77,24,3,154,concrete);
    block(side*36.95,-2.66,along+77,.38,.28,154,steel);
    for (const z of [along+24,along+80,along+130]) {
      const x=side*34.6;
      block(x,1.6,z,.16,8.2,.16,steel);
      block(x-side*.86,5.52,z,1.95,.18,.22,steel);
      block(x-side*1.65,5.4,z,.65,.14,.39,lamp);
      block(x, -2.52,z,1.4,.31,1.4,concrete);
    }
  }

  if (waterside) {
    const x=siding*27,z=along+92;
    storageBarge(x,z);
    for (const [i,offset] of [-10,3,15].entries()) container(x,-.05,z+offset,palette[(index+i)%4],10.2);
    if (index%3!==0) container(x,2.51,z+3,palette[(index+2)%4],10.2);
  } else {
    warehouse(siding,along+88);
    for (let i=0;i<4;i++) {
      const x=-siding*(38+3.15*(i%2)),z=along+49+Math.floor(i/2)*15;
      container(x,-1.46,z,palette[(i+index)%4]);
      if ((i+index)%3!==1) container(x,1.09,z,palette[(i+index+1)%4]);
    }
  }
  if (index%4===1 || section.branch) crane(-siding*28,along+61,-siding);
  if (index%4===3) {
    block(siding*34,-1.45,along+34,4,2.22,5.8,silver);
    block(siding*34,-.56,along+32.65,3.94,.98,.1,window);
    for (const d of [-1.7,1.7]) block(siding*34,-2.48,along+34+d,4.1,.72,.82,rubber);
  }

  for (const {x,x1=x,a,b,w,y0,y1,surface} of section.decks) {
    if (surface==='barge') {
      storageBarge((x+x1)/2,(a+b)/2,y0-.56,b-a+5,w+.06);
    } else if (surface==='containers') {
      for (const side of [-1,1]) container((x+x1)/2+side*1.53,y0-1.68,(a+b)/2,palette[index%4],b-a);
    } else if (b-a>8) {
      const t=.48,y=y0+(y1-y0)*t;
      for (const side of [-1,1]) {
        const xMid=x+(x1-x)*t+side*(w*.39);
        const zMid=a+(b-a)*t;
        const h=Math.max(.7,y+3.6);
        block(xMid,y-.65-h*.5,zMid,.75,h,1.15,concrete);
        block(xMid,y-.68,zMid,1.51,.37,1.75,steel);
      }
    }
  }
}
