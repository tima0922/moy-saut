import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS} from './game-state.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export function createWorld(renderer){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#202a30');scene.fog=new THREE.Fog('#263139',15,34);
  const env=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(env,0.05).texture;env.dispose();pmrem.dispose();
  const mats={
    wall:new THREE.MeshStandardMaterial({color:0x545f64,roughness:.93}),
    dark:new THREE.MeshStandardMaterial({color:0x1a242a,roughness:.64}),
    black:new THREE.MeshStandardMaterial({color:0x11171a,roughness:.8}),
    metal:new THREE.MeshStandardMaterial({color:0x9da7a6,metalness:.8,roughness:.33}),
    steel:new THREE.MeshStandardMaterial({color:0x545f64,metalness:.78,roughness:.43}),
    orange:new THREE.MeshStandardMaterial({color:0xf06b28,roughness:.36,metalness:.3}),
    paint:new THREE.MeshPhysicalMaterial({color:0xa7c5bb,metalness:.55,roughness:.24,clearcoat:1,clearcoatRoughness:.13}),
    white:new THREE.MeshStandardMaterial({color:0xd7e0dc,roughness:.4,metalness:.2}),
    rubber:new THREE.MeshStandardMaterial({color:0x13191b,roughness:.88}),
    glass:new THREE.MeshPhysicalMaterial({color:0x17343b,metalness:.24,roughness:.12,transparent:true,opacity:.88,clearcoat:1}),
    light:new THREE.MeshBasicMaterial({color:0xecf6f4}),
    red:new THREE.MeshStandardMaterial({color:0xbe352a,roughness:.35,emissive:0xb32013,emissiveIntensity:.25}),
    amber:new THREE.MeshStandardMaterial({color:0xe99137,emissive:0xf57816,emissiveIntensity:.3}),
    engine:new THREE.MeshStandardMaterial({color:0x737f80,metalness:.76,roughness:.35}),
    cover:new THREE.MeshStandardMaterial({color:0x242b2d,metalness:.35,roughness:.45}),
    rust:new THREE.MeshStandardMaterial({color:0x845d45,metalness:.42,roughness:.8}),
    blue:new THREE.MeshStandardMaterial({color:0x41778c,metalness:.45,roughness:.4}),
    gasket:new THREE.MeshStandardMaterial({color:0x886a40,metalness:.3,roughness:.75,side:THREE.DoubleSide}),
  };
  // Self-contained offline procedural-PBR pack. TextureLoader is disabled in GPU-less geometry tests.
  const textureFiles=['garage_tile','painted_concrete','cast_aluminium','powder_steel','technical_rubber','machined_steel'];
  const loadedTextures=[];
  const imageLoader=(typeof document.createElementNS==='function')?new THREE.TextureLoader():null;
  function tex(family,channel,repeat=[1,1]){
    if(!imageLoader)return null;
    const asset=imageLoader.load(`./assets/pbr/${family}_${channel}.png`,undefined,undefined,error=>console.warn('PBR missing',family,channel,error));
    if(channel==='basecolor')asset.colorSpace=THREE.SRGBColorSpace;
    asset.wrapS=asset.wrapT=THREE.RepeatWrapping;
    asset.repeat.set(...repeat);asset.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    loadedTextures.push(asset);return asset;
  }
  const atlas={
    tile:[tex('garage_tile','basecolor',[7,8]),tex('garage_tile','normal',[7,8]),tex('garage_tile','roughness',[7,8])],
    wall:[tex('painted_concrete','basecolor'),tex('painted_concrete','normal'),tex('painted_concrete','roughness')],
    cast:[tex('cast_aluminium','basecolor'),tex('cast_aluminium','normal'),tex('cast_aluminium','roughness')],
    powder:[tex('powder_steel','basecolor'),tex('powder_steel','normal'),tex('powder_steel','roughness')],
    rubber:[tex('technical_rubber','basecolor'),tex('technical_rubber','normal'),tex('technical_rubber','roughness')],
    machined:[tex('machined_steel','basecolor'),tex('machined_steel','normal'),tex('machined_steel','roughness')]
  };
  function layer(mat,pack,{strength=.25,roughness=1}={}){
    if(!pack[0])return;
    mat.map=pack[0];mat.normalMap=pack[1];mat.normalScale=new THREE.Vector2(strength,strength);
    mat.roughnessMap=pack[2];mat.roughness=roughness;
    mat.needsUpdate=true;
  }
  layer(mats.wall,atlas.wall,{strength:.12,roughness:1});mats.wall.color.set(0xffffff);
  layer(mats.engine,atlas.cast,{strength:.23,roughness:.85});mats.engine.color.set(0xffffff);mats.engine.metalness=.87;
  layer(mats.steel,atlas.powder,{strength:.11,roughness:.95});mats.steel.color.set(0xffffff);mats.steel.metalness=.58;
  layer(mats.rubber,atlas.rubber,{strength:.3,roughness:1});mats.rubber.color.set(0xffffff);
  layer(mats.metal,atlas.machined,{strength:.12,roughness:.9});mats.metal.color.set(0xffffff);mats.metal.metalness=.91;
  layer(mats.cover,atlas.rubber,{strength:.14,roughness:.85});mats.cover.color.set(0xc3c8c8);mats.cover.metalness=.1;
  mats.paint.metalness=0;mats.paint.roughness=.26;mats.paint.clearcoat=1;mats.paint.clearcoatRoughness=.14;
  mats.paint.envMapIntensity=1.3;
  mats.glass.metalness=0;mats.glass.roughness=.095;mats.glass.opacity=.71;mats.glass.ior=1.48;mats.glass.clearcoat=1;
  const targets=new Map(), bolts=new Map(), partObjects=new Map();
  const boxGeo=new THREE.BoxGeometry(1,1,1);
  function box(parent,size,pos,mat=mats.dark,rot){
    let material=mat;
    if(mat===mats.wall && atlas.wall[0]){
      const repeat=[Math.max(1,Math.max(size[0],size[2])/2.5),Math.max(1,size[1]/2.5)];
      material=mat.clone();
      // Clone samplers per wall, share pixel data; no GPU textures change in gameplay.
      for(const key of ['map','normalMap','roughnessMap']){
        if(mat[key]){material[key]=mat[key].clone();material[key].repeat.set(...repeat);material[key].needsUpdate=true;}
      }
    }
    const o=new THREE.Mesh(boxGeo,material);o.scale.set(...size);o.position.set(...pos);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function cylinder(parent,r1,r2,h,pos,mat=mats.metal,rot=[0,0,0],segments=16){const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat);o.position.set(...pos);o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function tube(parent,points,r,mat=mats.rubber){const curve=new THREE.CatmullRomCurve3(points.map(p=>V(...p)));const o=new THREE.Mesh(new THREE.TubeGeometry(curve,20,r,8,false),mat);o.castShadow=true;parent.add(o);return o;}
  function rounded(parent,size,pos,mat,r=.05){const [w,h,d]=size,shape=new THREE.Shape();shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelThickness:.018,bevelSize:.012,bevelSegments:2,steps:1,curveSegments:3});g.translate(0,0,-d/2);const o=new THREE.Mesh(g,mat);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function textPlane(parent,text,w,h,pos,rot=[0,0,0],fg='#e5e9e7',bg=null,opts={}){
    const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);const cx=c.getContext('2d');if(bg){cx.fillStyle=bg;cx.fillRect(0,0,c.width,c.height);}cx.fillStyle=fg;cx.font=`${opts.weight||'800'} ${Math.min(c.height*.72,c.width/(text.length*.62))}px Arial`;cx.textAlign='center';cx.textBaseline='middle';cx.fillText(text,c.width/2,c.height*.53);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshBasicMaterial({map:tex,transparent:!bg,depthWrite:!!bg,side:THREE.DoubleSide});const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.set(...pos);o.rotation.set(...rot);parent.add(o);return o;
  }
  function target(id,obj){obj.userData.target=id;targets.set(id,obj);return obj;}
  function group(parent,pos=[0,0,0]){const g=new THREE.Group();g.position.set(...pos);parent.add(g);return g;}

  // Real tiling PBR (base color + OpenGL normal + roughness), completely offline.
  // Canvas fallback is kept for headless tests and ultra-low devices with missing assets.
  let floorMap=atlas.tile[0],floorNormal=atlas.tile[1],floorRough=atlas.tile[2];
  if(!floorMap){const fallback=document.createElement('canvas');fallback.width=fallback.height=4;
    const fc=fallback.getContext('2d');fc.fillStyle='#627175';fc.fillRect(0,0,4,4);
    floorMap=new THREE.CanvasTexture(fallback);floorMap.colorSpace=THREE.SRGBColorSpace;
    floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.repeat.set(7,8);}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,16),new THREE.MeshStandardMaterial({map:floorMap,normalMap:floorNormal,normalScale:new THREE.Vector2(.28,.28),roughnessMap:floorRough,roughness:.97,metalness:.03}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  box(scene,[14,.2,16],[0,-.12,0],mats.dark);
  box(scene,[.23,5.5,16],[-7,2.75,0],mats.wall);box(scene,[.23,5.5,16],[7,2.75,0],mats.wall);box(scene,[14,5.5,.23],[0,2.75,-8],mats.wall);
  // Back wall around the entrance, opening is visible during arrival/departure.
  box(scene,[4.4,5.5,.23],[-4.8,2.75,8],mats.wall);box(scene,[4.4,5.5,.23],[4.8,2.75,8],mats.wall);box(scene,[5.2,1.2,.23],[0,4.95,8],mats.wall);
  for(const x of [-6.86,6.86]){box(scene,[.04,1.05,16],[x,.55,0],mats.dark);box(scene,[.05,.07,16],[x,1.1,0],mats.orange);}
  box(scene,[14,1.05,.04],[0,.55,-7.86],mats.dark);box(scene,[14,.07,.06],[0,1.1,-7.84],mats.orange);
  for(const x of [-6.8,6.8])for(const z of [-7,-2,3,7]){box(scene,[.18,5.3,.2],[x,2.7,z],mats.dark);}
  const ceiling=box(scene,[14,.12,16],[0,5.45,0],mats.dark);ceiling.receiveShadow=false;
  for(const z of [-5,0,5]){box(scene,[14,.2,.16],[0,5.1,z],mats.steel);for(const x of [-3.5,3.5]){box(scene,[.48,.09,3],[x,4.95,z],mats.black);box(scene,[.32,.025,2.8],[x,4.89,z],mats.light);}}
  // High windows and a diffused exterior, no imported background images.
  for(let z=-5.6;z<6;z+=2.8){box(scene,[.06,1.15,2.35],[-6.82,3.55,z],mats.black);box(scene,[.065,.94,2.12],[-6.77,3.55,z],new THREE.MeshBasicMaterial({color:0x9fbabf}));box(scene,[.08,1.1,.06],[-6.70,3.55,z],mats.steel);}
  const outside=box(scene,[12,.1,16],[0,-.04,15],mats.wall);
  box(scene,[18,7,.2],[0,3.5,23],new THREE.MeshBasicMaterial({color:0x798b91}));
  const door=group(scene,[0,0,7.95]);for(let y=.15;y<4.35;y+=.22){box(door,[5.1,.205,.1],[0,y,0],mats.steel);}
  box(scene,[.16,4.5,.2],[-2.65,2.25,7.7],mats.orange);box(scene,[.16,4.5,.2],[2.65,2.25,7.7],mats.orange);
  textPlane(scene,'GARAGE LIFE',3.5,.65,[-4.7,3,7.84],[0,Math.PI,0],'#c7d5d2');
  textPlane(scene,'01',1.8,2,[4.7,3,7.84],[0,Math.PI,0],'#f47734');
  textPlane(scene,'SERVICE / REPAIR',3.6,.32,[-4.7,2.44,7.83],[0,Math.PI,0],'#9badae');
  textPlane(scene,'WORK HARD. DRIVE HOME.',4.8,.45,[0,3.2,-7.85],[0,0,0],'#d6e0dc');
  textPlane(scene,'01',1.6,2,[-2.9,.012,-3.9],[-Math.PI/2,0,0],'#c2cbc6');
  // Painted bay lines and warning stripes.
  for(const x of [-2.2,2.2])box(scene,[.065,.012,6.7],[x,.012,0],mats.orange);
  for(const z of [-3.35,3.35])box(scene,[4.45,.012,.065],[0,.012,z],mats.orange);
  for(const x of [-2.9,2.9])for(let z=-.5;z<1;z+=.24)box(scene,[.65,.014,.095],[x,.017,z],mats.amber,[0,-.65,0]);
  const ambient=new THREE.HemisphereLight(0xdcebf0,0x555447,2.2);scene.add(ambient);
  const key=new THREE.DirectionalLight(0xf5f8ec,3.3);key.position.set(-3.5,7,-4.5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-8,right:8,top:9,bottom:-9,near:.5,far:24});key.shadow.bias=-.0004;key.shadow.normalBias=.035;scene.add(key);
  const fill=new THREE.PointLight(0xb4d7e8,70,15,2);fill.position.set(4.4,4.2,1.4);scene.add(fill);
  const worklight=new THREE.PointLight(0xffd5ab,26,8,2);worklight.position.set(4,2.8,-3.8);scene.add(worklight);

  // A two-post lift with animated support arms.
  const lift=group(scene);const arms=group(lift);
  for(const x of [-2.7,2.7]){
    box(lift,[.7,.12,.9],[x,.06,.5],mats.dark);box(lift,[.34,3.5,.4],[x,1.8,.5],mats.orange);box(lift,[.18,3.3,.12],[x,1.8,.23],mats.steel);box(lift,[.46,.28,.62],[x,3.65,.5],mats.dark);
    for(const z of [-1.2,1.5]){box(arms,[1.95,.12,.17],[x/2,.16,z],mats.dark,[0,x<0?-.16:.16,0]);cylinder(arms,.13,.13,.1,[Math.sign(x)*.82,.24,z],mats.rubber);}
  }
  const control=box(lift,[.28,.44,.16],[-2.73,1.35,.17],mats.dark);target('lift',control);
  box(lift,[.13,.13,.02],[-2.73,1.45,.075],mats.amber);box(lift,[.13,.09,.02],[-2.73,1.26,.075],mats.white);
  box(lift,[5.75,.16,.2],[0,3.58,.5],mats.dark);

  // Workshop architecture: slim cable conduits, protective skirting, fire and safety markings.
  for(const x of [-6.6,6.6]){
    for(const z of [-6,-2,2,6]){
      const conduit=box(scene,[.032,.038,2.5],[x,4.31,z],mats.metal);conduit.castShadow=false;
    }
    box(scene,[.075,.13,15.4],[x,.16,0],mats.black);
  }
  for(const z of [-6.45,-2.05,2.35,6.75]){
    box(scene,[.1,.028,.8],[6.73,1.52,z],mats.orange);
    box(scene,[.05,.035,.53],[6.68,1.52,z],mats.black);
  }
  // Wall-mounted diagnostic monitor and OSHA-style hazard tags.
  box(scene,[.09,.75,1.12],[6.69,2.55,3.12],mats.black);
  box(scene,[.1,.58,.94],[6.64,2.55,3.12],mats.blue);
  textPlane(scene,'SERVICE DIAGNOSTICS',.72,.12,[6.575,2.79,3.12],[0,-Math.PI/2,0],'#d6ecec');
  textPlane(scene,'220 V',.4,.14,[6.575,2.36,3.12],[0,-Math.PI/2,0],'#ecf4f4');

  // Custom modular sedan: open engine bay and separate hinged bonnet.
  const car=group(scene);const wheels=[];
  box(car,[1.65,.22,4.15],[0,.48,0],mats.dark);
  for(const x of [-.92,.92]){
    const s=new THREE.Shape();s.moveTo(-2.18,.43);s.lineTo(-1.93,.43);s.absarc(-1.43,.43,.5,Math.PI,0,true);s.lineTo(.93,.43);s.absarc(1.43,.43,.5,Math.PI,0,true);s.lineTo(2.18,.43);s.lineTo(2.18,.98);s.lineTo(1.5,1.12);s.lineTo(-.76,1.12);s.lineTo(-2.18,.99);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:.15,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:12});const m=new THREE.Mesh(g,mats.paint);m.rotation.y=Math.PI/2;m.position.x=x-.075;m.castShadow=true;car.add(m);
    box(car,[.08,.07,3.9],[x*1.035,.57,0],mats.black);
    box(car,[.045,.04,3.95],[x*1.04,.94,0],mats.black);
    for(const z of [-.4,.8]){box(car,[.025,.1,.19],[x*1.055,1.05,z],mats.dark);box(car,[.035,.035,.16],[x*1.07,1.07,z],mats.metal);}
    for(const z of [-.68,.66])box(car,[.026,.44,.018],[x*1.035,.82,z],mats.steel);
    for(const z of [-1.43,1.43]){
      const wg=group(car,[x,.46,z]);cylinder(wg,.405,.405,.23,[0,0,0],mats.rubber,[0,0,Math.PI/2],32);
      const outer=x<0?-.126:.126;cylinder(wg,.292,.292,.018,[outer,0,0],mats.dark,[0,0,Math.PI/2],32);cylinder(wg,.245,.245,.026,[outer*1.1,0,0],mats.metal,[0,0,Math.PI/2],24);cylinder(wg,.09,.09,.04,[outer*1.22,0,0],mats.dark,[0,0,Math.PI/2],12);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;box(wg,[.02,.058,.42],[outer*1.25,0,0],mats.steel,[a,0,0]);}
      for(let i=0;i<5;i++){const a=i*2*Math.PI/5;cylinder(wg,.015,.015,.015,[outer*1.5,Math.cos(a)*.068,Math.sin(a)*.068],mats.white,[0,0,Math.PI/2],6);}
      const tor=new THREE.Mesh(new THREE.TorusGeometry(.37,.015,5,40),mats.steel);tor.rotation.y=Math.PI/2;tor.position.x=outer;wg.add(tor);
      const treadCount=40;
      const treadGeo=new THREE.BoxGeometry(.22,.018,.074);
      const treads=new THREE.InstancedMesh(treadGeo,mats.rubber,treadCount);
      const dummy=new THREE.Object3D();
      for(let ti=0;ti<treadCount;ti++){
        const a=ti*Math.PI*2/treadCount;
        dummy.position.set(0,Math.cos(a)*.403,Math.sin(a)*.403);
        dummy.rotation.set(a,0,0);dummy.updateMatrix();treads.setMatrixAt(ti,dummy.matrix);
      }
      treads.instanceMatrix.needsUpdate=true;treads.castShadow=true;treads.receiveShadow=true;wg.add(treads);
      wheels.push(wg);
    }
  }
  // Body glass is an extruded cabin silhouette, with separate posts and roof.
  const cabinShape=new THREE.Shape();cabinShape.moveTo(-.85,1.09);cabinShape.lineTo(-.38,1.72);cabinShape.lineTo(.76,1.72);cabinShape.lineTo(1.34,1.12);cabinShape.closePath();
  const cabinGeo=new THREE.ExtrudeGeometry(cabinShape,{depth:1.65,bevelEnabled:false});const cabin=new THREE.Mesh(cabinGeo,mats.glass);cabin.rotation.y=-Math.PI/2;cabin.position.x=.825;car.add(cabin);
  rounded(car,[1.68,.08,1.18],[0,1.74,.18],mats.paint,.06);
  for(const x of [-.84,.84]){
    box(car,[.075,.73,.065],[x,1.4,-.61],mats.paint,[-.64,0,0]);box(car,[.08,.7,.065],[x,1.4,1.04],mats.paint,[.72,0,0]);box(car,[.07,.62,.07],[x,1.4,.32],mats.black);box(car,[.09,.05,1.9],[x,1.1,.21],mats.paint);
    const mirror=rounded(car,[.24,.15,.24],[x*1.2,1.22,-.58],mats.paint,.04);box(car,[.15,.035,.07],[x*1.12,1.18,-.56],mats.black);
    rounded(car,[.13,.09,.16],[x*1.22,1.23,-.47],mats.metal,.02);
  }
  box(car,[1.65,.09,.75],[0,1.1,1.75],mats.paint);rounded(car,[1.88,.24,.16],[0,.76,2.18],mats.paint,.05);
  rounded(car,[1.88,.23,.16],[0,.76,-2.18],mats.paint,.05);box(car,[1.87,.1,.16],[0,.49,-2.14],mats.black);
  box(car,[.64,.21,.05],[0,.86,-2.28],mats.dark);for(let i=0;i<6;i++)box(car,[.61,.012,.016],[0,.78+i*.03,-2.315],mats.metal);
  for(const x of [-.65,.65]){rounded(car,[.53,.2,.08],[x,.93,-2.23],mats.dark,.018);rounded(car,[.43,.15,.085],[x,.94,-2.28],mats.light,.012);box(car,[.075,.15,.09],[x+Math.sign(x)*.25,.94,-2.24],mats.amber);rounded(car,[.58,.17,.07],[x,.93,2.23],mats.red,.02);}
  textPlane(car,'KOVA',.33,.08,[0,1,2.27],[0,Math.PI,0]);textPlane(car,'GL • 001',.48,.12,[0,.66,-2.29],[0,Math.PI,0],'#283336','#e9eee7');
  cylinder(car,.045,.045,.24,[-.55,.4,2.2],mats.metal,[Math.PI/2,0,0]);
  // Interior visible through windows.
  for(const x of [-.43,.43]){rounded(car,[.55,.18,.55],[x,.82,.1],mats.dark,.08);const seat=rounded(car,[.55,.63,.16],[x,1.07,.42],mats.dark,.08);seat.rotation.x=-.12;rounded(car,[.31,.2,.14],[x,1.5,.45],mats.dark,.05);}
  box(car,[1.6,.21,.33],[0,1.1,-.58],mats.dark);const steering=new THREE.Mesh(new THREE.TorusGeometry(.17,.022,8,24),mats.black);steering.position.set(-.45,1.27,-.37);steering.rotation.x=-.35;car.add(steering);
  const hood=group(car,[0,1.13,-.69]);const hoodMesh=rounded(hood,[1.72,.055,1.41],[0,-.03,-.74],mats.paint,.045);hood.rotation.x=.02;target('hood',hoodMesh);
  for(const x of [-.5,.5])box(hood,[.017,.009,1.1],[x,.005,-.78],mats.paint);
  box(car,[1.5,.1,.15],[0,.95,-2.04],mats.dark);box(car,[1.55,.44,.08],[0,.69,-1.98],mats.steel);for(let i=0;i<15;i++)box(car,[.03,.39,.03],[-.7+i*.1,.7,-2.03],mats.dark);
  const batt=rounded(car,[.32,.29,.37],[-.62,.86,-1.55],mats.black,.025);textPlane(car,'12V',.22,.08,[-.62,1.01,-1.55],[-Math.PI/2,0,0],'#e8bd62');
  target('scanner',box(car,[.19,.055,.27],[-.62,1.18,-.67],mats.orange));

  // 26 individually removable assemblies; local origins survive re-parenting.
  const engine=group(car,[0,.68,-1.28]);engine.scale.set(.95,.6,1);
  rounded(engine,[.59,.42,.9],[0,0,0],mats.engine,.04);rounded(engine,[.51,.15,.82],[0,-.29,0],mats.cover,.03);
  for(let z=-.3;z<=.3;z+=.2){cylinder(engine,.082,.082,.04,[0,.225,z],mats.dark,[0,0,0],24);cylinder(engine,.068,.068,.045,[0,.23,z],mats.metal,[0,0,0],24);}
  for(const x of [-.31,.31])for(let z=-.32;z<.4;z+=.15)box(engine,[.018,.32,.03],[x,0,z],mats.steel);
  // Casting seams, cooling fins and fuel rail: attached to the same engine assembly.
  for(const x of [-.306,.306])for(let z=-.36;z<=.36;z+=.075){
    box(engine,[.018,.15,.028],[x,-.11,z],mats.engine);
  }
  const fuelRail=tube(engine,[[-.26,.4,-.35],[-.26,.4,.35]],.023,mats.metal);
  for(let z=-.3;z<=.31;z+=.2)cylinder(engine,.016,.016,.09,[-.26,.37,z],mats.blue,[0,0,Math.PI/2],10);

  cylinder(engine,.18,.18,.1,[0,-.07,-.51],mats.dark,[Math.PI/2,0,0],24);cylinder(engine,.11,.11,.12,[0,-.07,-.53],mats.metal,[Math.PI/2,0,0],16);
  function part(id,parent,pos,make){const p=group(parent,pos);p.name=id;make(p);target(id,p);partObjects.set(id,{object:p,homeParent:parent,homePosition:p.position.clone(),homeRotation:p.quaternion.clone()});return p;}
  part('battery',car,[-.66,1.03,-1.55],p=>{cylinder(p,.036,.036,.045,[0,0,0],mats.metal);tube(p,[[0,0,0],[-.1,-.04,.13],[-.12,-.28,.23]],.017,mats.black);});
  part('intake_duct',car,[.39,1.02,-1.1],p=>tube(p,[[0,0,0],[.23,.01,-.03],[.28,-.04,-.34]],.061));
  part('airbox',car,[.62,.89,-1.65],p=>{rounded(p,[.32,.29,.4],[0,0,0],mats.dark,.025);for(let z=-.15;z<.16;z+=.045)box(p,[.31,.018,.014],[0,.15,z],mats.steel);});
  part('wiring',car,[-.31,1.02,-1.28],p=>{tube(p,[[0,0,-.32],[0,.04,.3],[.18,-.1,.48]],.025);for(let z=-.3;z<=.3;z+=.2)tube(p,[[0,0,z],[.2,.06,z]],.009,mats.blue);});
  part('fuel_line',car,[.32,.98,-1.26],p=>{tube(p,[[0,0,-.3],[0,0,.3],[.2,0,.46]],.016,mats.metal);});
  part('upper_hose',car,[-.25,.99,-1.82],p=>tube(p,[[0,0,0],[0,.02,-.1],[.25,.03,-.13],[.28,.02,.17]],.035));
  part('lower_hose',car,[.38,.57,-1.76],p=>tube(p,[[0,0,0],[.1,0,-.15],[-.1,-.05,-.2],[-.3,-.04,.16]],.04));
  part('downpipe',car,[-.38,.54,-.95],p=>{tube(p,[[0,.2,0],[0,0,.1],[0,-.08,.5],[.1,-.08,.8]],.052,mats.rust);});
  part('cylinder_head',engine,[0,.29,0],p=>{rounded(p,[.62,.13,.92],[0,0,0],mats.engine,.025);for(let z=-.3;z<=.31;z+=.2){cylinder(p,.067,.067,.015,[0,.078,z],mats.dark);for(const x of [-.13,.13])cylinder(p,.045,.045,.03,[x,.085,z],mats.steel);}});
  part('valve_cover',engine,[0,.5,0],p=>{rounded(p,[.54,.13,.85],[0,0,0],mats.cover,.04);for(const x of [-.17,.17])box(p,[.04,.012,.7],[x,.075,0],mats.steel);textPlane(p,'KOVA 16V',.32,.09,[0,.072,0],[-Math.PI/2,0,0],'#bac4c4');});
  for(let i=0;i<4;i++){
    const z=-.3+i*.2;
    part(`coil_${i+1}`,engine,[0,.61,z],p=>{rounded(p,[.1,.08,.12],[0,0,0],mats.dark,.014);cylinder(p,.025,.025,.12,[0,-.06,0],mats.black);box(p,[.065,.035,.055],[.06,.01,0],mats.blue);});
    part(`plug_${i+1}`,engine,[0,.45,z],p=>{cylinder(p,.018,.018,.12,[0,0,0],mats.white);cylinder(p,.026,.026,.04,[0,-.06,0],mats.metal,[0,0,0],6);cylinder(p,.012,.012,.035,[0,-.1,0],mats.metal);});
  }
  part('intake_manifold',engine,[.32,.26,0],p=>{rounded(p,[.2,.17,.72],[.12,.04,0],mats.engine,.035);for(let z=-.3;z<=.31;z+=.2)tube(p,[[0,-.05,z],[.16,.05,z],[.12,.14,z]],.038,mats.metal);});
  part('exhaust_manifold',engine,[-.33,.2,0],p=>{for(let z=-.3;z<=.31;z+=.2)tube(p,[[0,.08,z],[-.14,-.04,z],[-.16,-.13,.2]],.034,mats.rust);});
  part('timing_cover',engine,[0,.24,-.51],p=>rounded(p,[.48,.68,.07],[0,0,0],mats.cover,.06));
  part('timing_belt',engine,[0,.24,-.49],p=>{tube(p,[[-.17,.22,0],[.17,.22,0],[.12,-.32,0],[-.12,-.32,0],[-.17,.22,0]],.02,mats.rubber);});
  for(const [id,x] of [['camshaft_in',-.15],['camshaft_out',.15]])part(id,engine,[x,.405,0],p=>{cylinder(p,.022,.022,.9,[0,0,0],mats.metal,[Math.PI/2,0,0]);for(let z=-.3;z<=.31;z+=.2){const m=cylinder(p,.052,.052,.045,[0,0,z],mats.steel,[Math.PI/2,0,0]);m.scale.x=.7;}cylinder(p,.103,.103,.04,[0,0,-.47],mats.steel,[Math.PI/2,0,0],24);cylinder(p,.04,.04,.046,[0,0,-.47],mats.metal,[Math.PI/2,0,0],6);});
  part('oil_filter',engine,[.35,-.08,.29],p=>{cylinder(p,.085,.085,.21,[0,0,0],mats.blue);cylinder(p,.08,.08,.02,[0,.11,0],mats.metal);});
  const gasketShape=new THREE.Shape();gasketShape.moveTo(-.29,-.44);gasketShape.lineTo(.29,-.44);gasketShape.lineTo(.29,.44);gasketShape.lineTo(-.29,.44);gasketShape.closePath();for(let z=-.3;z<=.31;z+=.2){const hole=new THREE.Path();hole.absarc(0,z,.082,0,Math.PI*2,true);gasketShape.holes.push(hole);}
  part('gasket',engine,[0,.215,0],p=>{const g=new THREE.ShapeGeometry(gasketShape);g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,mats.gasket);m.castShadow=true;p.add(m);box(p,[.09,.004,.04],[.07,.004,-.16],mats.black);});
  // Visible fasteners have their own targets and removal animations.
  for(const spec of PARTS.filter(p=>p.bolts)){
    const p=partObjects.get(spec.id).object;
    for(let i=0;i<spec.bolts;i++){
      const side=i%2===0?-1:1,row=Math.floor(i/2),n=Math.ceil(spec.bolts/2);let pos=[side*.22,.09,n>1?-.27+row*.54/(n-1):0];
      if(spec.id==='cylinder_head')pos=[side*.25,.08,-.3+row*.3];
      if(spec.id==='timing_cover')pos=[i===2?0:side*.17,i===2?-.25:.24,-.05];
      if(spec.id.startsWith('camshaft'))pos=[0,.04,i===0?-.28:.28];
      if(spec.id==='downpipe')pos=[side*.06,.22,0];
      if(spec.id.includes('manifold'))pos=[0,.12,i===0?-.27:.27];
      const b=cylinder(p,.024,.024,.025,pos,mats.metal,[0,0,0],6);b.userData.home=b.position.clone();target(`${spec.id}_bolt_${i}`,b);bolts.set(`${spec.id}_bolt_${i}`,b);
    }
  }
  for(let i=0;i<4;i++){const x=i%2===0?-.49:.49,z=i<2?-1.6:-.94;box(car,[.22,.1,.18],[x,.7,z],mats.dark);const b=cylinder(car,.045,.045,.055,[x,.78,z],mats.metal,[0,0,0],6);b.userData.home=b.position.clone();target(`mount_${i}`,b);bolts.set(`mount_${i}`,b);}
  target('engine',engine);
  target('oil_drain',cylinder(car,.042,.042,.03,[0,.38,-1.26],mats.orange,[0,0,0],6));
  target('coolant_drain',cylinder(car,.042,.042,.03,[.56,.48,-1.9],mats.blue,[0,0,0],6));
  target('refill',cylinder(partObjects.get('valve_cover').object,.04,.04,.03,[.13,.085,.23],mats.orange));

  // Workbench, sorted parts area, cabinets and rolling tool chest.
  const bench=group(scene,[5.1,0,-3.35]);
  box(bench,[2.8,.12,1.35],[0,1.03,0],mats.steel);for(const x of [-1.2,1.2])for(const z of [-.5,.5])box(bench,[.09,.97,.09],[x,.48,z],mats.dark);box(bench,[2.55,.07,1.15],[0,.2,0],mats.dark);
  box(scene,[.13,1.8,4.2],[6.8,1.95,-3.1],mats.dark);
  for(let z=-4.7;z<-1.4;z+=.24)for(let y=1.3;y<2.7;y+=.2)cylinder(scene,.009,.009,.015,[6.72,y,z],mats.steel,[0,0,Math.PI/2],6);
  for(let i=0;i<6;i++){const z=-4.5+i*.43;box(scene,[.04,.43,.055],[6.65,2.1,z],mats.metal);cylinder(scene,.055,.055,.025,[6.65,2.34,z],mats.metal,[0,0,Math.PI/2],6);}
  textPlane(scene,'THE RIGHT TOOL. THE RIGHT WAY.',3.2,.27,[6.68,3,-3.2],[0,-Math.PI/2,0],'#d9dfd8');
  const newPart=group(scene,[4.8,1.15,-3.45]);box(newPart,[.7,.07,1.02],[0,0,0],mats.dark);box(newPart,[.62,.025,.9],[0,.05,0],mats.orange);textPlane(newPart,'NEW / PART',.52,.13,[0,.07,.2],[-Math.PI/2,0,0],'#191f22');target('new_part',newPart);
  const partsTray=group(scene,[5.1,1.12,-3.35]);
  const cart=group(scene,[-3.85,0,-1.75]);box(cart,[1.15,.86,.67],[0,.54,0],mats.orange);box(cart,[1.26,.07,.76],[0,1.01,0],mats.dark);for(let y=.23;y<.9;y+=.16){box(cart,[1.04,.12,.018],[0,y,-.35],mats.orange);box(cart,[.8,.025,.04],[0,y+.04,-.37],mats.metal);}
  for(const x of [-.45,.45])for(const z of [-.24,.24])cylinder(cart,.085,.085,.07,[x,.09,z],mats.rubber,[0,0,Math.PI/2]);
  box(cart,[.05,.16,.7],[.68,.96,0],mats.metal);box(cart,[.08,.04,.69],[.68,1.08,0],mats.dark);
  const tray=box(cart,[.86,.025,.4],[0,1.06,0],mats.steel);for(let i=0;i<4;i++){cylinder(cart,.025,.025,.29,[-.3+i*.17,1.1,0],mats.metal,[Math.PI/2,0,0],8);}
  const cabinet=group(scene,[-6.25,0,2.7]);box(cabinet,[1.1,2.2,2.4],[0,1.1,0],mats.dark);for(const z of [-.61,.61]){box(cabinet,[.03,2.05,1.12],[.57,1.1,z],mats.steel);box(cabinet,[.055,.24,.035],[.62,1.12,z-.37],mats.metal);}
  // Engine stand.
  const stand=group(scene,[3.55,0,-.8]);box(stand,[1.2,.09,.85],[0,.13,0],mats.orange);box(stand,[.15,1.05,.15],[0,.66,.18],mats.orange);cylinder(stand,.14,.14,.28,[0,1.2,.18],mats.dark,[Math.PI/2,0,0]);box(stand,[.63,.08,.35],[0,1.08,-.08],mats.metal);
  for(const x of [-.5,.5])for(const z of [-.32,.32])cylinder(stand,.085,.085,.07,[x,.09,z],mats.rubber,[0,0,Math.PI/2]);target('stand',stand);
  const standEnginePosition=V(3.55,1.32,-1.03);
  // Mobile engine crane, with hydraulics and a chain.
  const crane=group(scene,[3.7,0,2.7]);for(const x of [-.5,.5]){box(crane,[.12,.1,1.9],[x,.16,-.35],mats.orange);for(const z of [-1.17,.5])cylinder(crane,.08,.08,.06,[x,.08,z],mats.rubber,[0,0,Math.PI/2]);}
  box(crane,[1.12,.12,.16],[0,.17,.48],mats.orange);box(crane,[.15,2.5,.15],[0,1.4,.5],mats.orange,[.1,0,0]);box(crane,[.15,.15,1.85],[0,2.66,-.37],mats.orange,[-.16,0,0]);cylinder(crane,.06,.06,1.05,[0,1.65,.16],mats.metal,[-.4,0,0]);cylinder(crane,.095,.095,.55,[0,1.2,.34],mats.dark,[-.4,0,0]);
  const chain=group(crane,[0,2.45,-1.25]);for(let i=0;i<9;i++){const link=new THREE.Mesh(new THREE.TorusGeometry(.025,.007,5,8),mats.metal);link.position.y=-i*.042;link.rotation.y=i%2*Math.PI/2;chain.add(link);}target('crane',crane);
  const hookLight=new THREE.PointLight(0xfaa15a,2,3);hookLight.position.set(0,2,-1.25);crane.add(hookLight);
  target('exit',textPlane(scene,'ВЫЕЗД →',1.2,.35,[2,1.6,7.65],[0,Math.PI,0],'#dfe5d6','#263b36'));
  // A real GLB prop pack, local and licensed CC0. Failures never block the repair.
  const loader=new GLTFLoader();const assetStatus={loaded:0,failed:0};
  async function addProp(name,pos,height,rotation=0){try{const gltf=await loader.loadAsync(`./assets/kenney/${name}.glb`);const model=gltf.scene;const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(V());model.scale.setScalar(height/Math.max(size.y,.01));const b=new THREE.Box3().setFromObject(model),center=b.getCenter(V());model.position.set(-center.x,-b.min.y,-center.z);const root=group(scene,pos);root.rotation.y=rotation;root.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});assetStatus.loaded++;}catch(e){assetStatus.failed++;console.warn(`Optional prop ${name} unavailable`,e.message);}}
  const assetsReady=Promise.all([addProp('barrel',[-5.9,0,5.3],.95),addProp('barrel',[-5,0,5.6],.95),addProp('box',[5.95,0,4.9],.65),addProp('box',[5.95,.65,4.9],.45,.3),addProp('bucket',[-3.8,0,-3.2],.4),addProp('tool-hammer',[-3.8,1.07,-1.72],.08,Math.PI/2)]);
  // A soft grounding contact decal helps low graphics modes retain depth.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),grad=sc.createRadialGradient(64,64,6,64,64,64);grad.addColorStop(0,'rgba(0,0,0,.55)');grad.addColorStop(.65,'rgba(0,0,0,.27)');grad.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=grad;sc.fillRect(0,0,128,128);const contact=new THREE.Mesh(new THREE.PlaneGeometry(3.8,6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=.024;scene.add(contact);
  const particlesGeo=new THREE.BufferGeometry(),positions=new Float32Array(90*3);for(let i=0;i<90;i++){positions[i*3]=(Math.sin(i*31)*.5+.5)*12-6;positions[i*3+1]=.8+(Math.sin(i*47)*.5+.5)*3.7;positions[i*3+2]=Math.sin(i*11)*7;}particlesGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const dust=new THREE.Points(particlesGeo,new THREE.PointsMaterial({color:0xc3d1ca,size:.014,transparent:true,opacity:.24,depthWrite:false}));scene.add(dust);
  const highlight=new THREE.BoxHelper(new THREE.Object3D(),0xf69c51);highlight.material.transparent=true;highlight.material.opacity=.65;highlight.material.depthTest=false;highlight.visible=false;highlight.renderOrder=10;scene.add(highlight);
  // Invisible geometric install targets share the true home-parent transform.
  const installSlots=new Map();
  for(const [id,rec] of partObjects){
    const socket=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),new THREE.MeshBasicMaterial({visible:false,depthWrite:false}));
    socket.position.copy(rec.homeParent.localToWorld(rec.homePosition.clone()));scene.add(socket);installSlots.set(id,socket);
  }
  const rayTargets=()=>[...targets.values()].filter(o=>o.visible);
  function setTextureQuality(q){
    const anisotropy=q==='low'?1:q==='balanced'?4:8;
    for(const t of loadedTextures){t.anisotropy=Math.min(anisotropy,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;}
  }
  return {scene,mats,car,engine,hood,door,wheels,lift,arms,crane,chain,stand,standEnginePosition,targets,partObjects,bolts,installSlots,partsTray,newPart,contact,highlight,key,dust,assetsReady,assetStatus,rayTargets,box,cylinder,textPlane,setTextureQuality};
}
