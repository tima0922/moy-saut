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
    water,deck,concrete:paint(0x7d807b),steel:paint(0x4c585d),
    containers:[paint(0x884d3b),paint(0x356d68),paint(0x405d79),paint(0xaca99a)],
  };
}

export function addDockScenery(block,section,index,{steel,concrete,containers}) {
  function container(x,y,z,color,length=11.7) {
    block(x,y,z,3.05,2.55,length,color);
    for (const edge of [-1,1]) {
      block(x+edge*1.49,y+1.25,z,.09,.11,length,steel);
      block(x+edge*1.49,y-1.25,z,.09,.11,length,steel);
      for (let i=-4;i<=4;i++) block(x+edge*1.535,y,z+i*length/10,.065,2.32,.14,color);
    }
    for (const end of [-1,1]) for (const offset of [-.48,.48]) block(x+offset,y,z+end*(length*.5+.03),.045,2.21,.08,steel);
  }

  for (const {x,x1=x,a,b,w,y0,y1,surface} of section.decks) {
    if (surface==='containers') {
      for (const side of [-1,1]) container((x+x1)/2+side*1.53,y0-1.68,(a+b)/2,containers[index%4],b-a);
    } else if (surface!=='barge' && surface!=='roof' && b-a>8) {
      const t=.48,y=y0+(y1-y0)*t;
      for (const side of [-1,1]) {
        const xMid=x+(x1-x)*t+side*(w*.39);
        const zMid=a+(b-a)*t;
        const h=Math.max(.7,y+7.15);
        block(xMid,y-.65-h*.5,zMid,.75,h,1.15,concrete);
        block(xMid,y-.68,zMid,1.51,.37,1.75,steel);
      }
    }
  }
}
