// Procedural PACKET hardware. All device fronts face +Z; the base rests at Y=0.
// Materials/geometries cached here are shared. Do not dispose them per removed node.
const libraries = new WeakMap();
function library(T) {
  if (libraries.has(T)) return libraries.get(T);
  const mat = (color, metalness=.65, roughness=.3, extra={}) => {
    const m = new T.MeshStandardMaterial({color, metalness, roughness, ...extra});
    m.userData.shared = true; return m;
  };
  const mint = mat('#88ffe2',.2,.23,{emissive:'#48e3bd',emissiveIntensity:2.4});
  const lilac = mat('#c9adff',.3,.25,{emissive:'#9870f3',emissiveIntensity:1.8});
  const white = mat('#f7efdb',.5,.22,{emissive:'#e3d8c1',emissiveIntensity:.7});
  // Slightly broader highlights keep finely machined surfaces readable in motion.
  const dark = mat('#11191d',.68,.34), graphite = mat('#253336',.72,.32), silver = mat('#82978f',.82,.30), black = mat('#050a0e',.3,.48), glass = mat('#0a2630',.60,.24);
  const screen = new T.ShaderMaterial({
    uniforms:{time:{value:0}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float; varying vec2 vUv; uniform float time;
      float stroke(float distanceToLine,float width){float aa=max(fwidth(distanceToLine),.00035);return 1.-smoothstep(width-aa,width+aa,distanceToLine);}
      float disk(vec2 uv,vec2 p,float radius){float d=length(uv-p);float aa=max(fwidth(d),.0004);return 1.-smoothstep(radius-aa,radius+aa,d);}
      float panel(vec2 uv,vec2 lo,vec2 hi){vec2 aa=max(fwidth(uv),vec2(.0004));vec2 l=smoothstep(lo-aa,lo+aa,uv);vec2 h=1.-smoothstep(hi-aa,hi+aa,uv);return l.x*l.y*h.x*h.y;}
      void main(){vec2 uv=vUv;vec3 base=vec3(.009,.035,.045);
        vec2 gridUv=uv*vec2(12.,8.);vec2 gridDistance=abs(fract(gridUv-.5)-.5);
        float grid=(stroke(gridDistance.x,.018)+stroke(gridDistance.y,.018))*.34;
        grid*=1.-smoothstep(.12,.40,max(fwidth(gridUv.x),fwidth(gridUv.y)));
        float scan=exp(-pow((uv.y-fract(time*.12))/.045,2.));
        vec2 nodes[5];nodes[0]=vec2(.18,.55);nodes[1]=vec2(.43,.68);nodes[2]=vec2(.68,.5);nodes[3]=vec2(.43,.30);nodes[4]=vec2(.82,.72);
        float lines=0.;float pts=0.;
        for(int i=0;i<4;i++){vec2 a=nodes[i],b=nodes[i+1];vec2 pa=uv-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);lines+=stroke(length(pa-ba*h),.0035);}
        for(int i=0;i<5;i++){float d=length(uv-nodes[i]);pts+=disk(uv,nodes[i],.016);pts+=.5*stroke(abs(d-.032),.0025);}
        float bars=panel(uv,vec2(.08,.85),vec2(.30,.88))+panel(uv,vec2(.08,.90),vec2(.55,.912));
        float stripe=stroke(abs(fract(uv.y*20.-.5)-.5),.22);
        stripe*=1.-smoothstep(.12,.40,fwidth(uv.y)*20.);
        float tiny=panel(uv,vec2(.76,.10),vec2(.94,.31))*stripe;
        vec3 color=base+vec3(.08,.25,.22)*grid+vec3(.15,.83,.66)*(lines*.58+pts+bars+tiny*.5)+vec3(.1,.33,.3)*scan;
        // No high-frequency scanline modulation: it aliases at oblique angles.
        gl_FragColor=vec4(color,1.);
      }`,toneMapped:false
  });screen.userData.shared=true;
  const unitBox=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(1,1,1,32), sphere=new T.SphereGeometry(1,24,16);
  [unitBox,cylinder,sphere].forEach(g=>g.userData.shared=true);
  const cache={T,mat:{mint,lilac,white,dark,graphite,silver,black,glass,screen},geo:{unitBox,cylinder,sphere}};
  libraries.set(T,cache);return cache;
}

// Repeated details use instance batches: hundreds of keys, vents and LED cells,
// but just one draw call per material/primitive inside each device.
function builder(T, root) {
  const L=library(T), lists=new Map(), temp=new T.Object3D();
  function instance(kind,material,x,y,z,w,h,d,rx=0,ry=0,rz=0) {
    const key=kind+'-'+material; if(!lists.has(key))lists.set(key,{geo:L.geo[kind],material:L.mat[material],items:[]});
    lists.get(key).items.push([x,y,z,w,h,d,rx,ry,rz]);
  }
  function box(mat,x,y,z,w,h,d,rx=0,ry=0,rz=0){instance('unitBox',mat,x,y,z,w,h,d,rx,ry,rz)}
  function cyl(mat,x,y,z,r,h,rx=0,ry=0,rz=0){instance('cylinder',mat,x,y,z,r,h,r,rx,ry,rz)}
  function ball(mat,x,y,z,r){instance('sphere',mat,x,y,z,r,r,r)}
  function mesh(geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){const m=new T.Mesh(geo,L.mat[mat]);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;m.receiveShadow=true;root.add(m);return m}
  function bevel(mat,x,y,z,w,h,d,r=.06){
    // Avoid self-crossing paths on very thin lids and keyboard slabs.
    r=Math.min(r,w*.45,h*.45);
    const shape=new T.Shape(),a=-w/2,b=-h/2;
    shape.moveTo(a+r,b);shape.lineTo(a+w-r,b);shape.quadraticCurveTo(a+w,b,a+w,b+r);shape.lineTo(a+w,b+h-r);shape.quadraticCurveTo(a+w,b+h,a+w-r,b+h);shape.lineTo(a+r,b+h);shape.quadraticCurveTo(a,b+h,a,b+h-r);shape.lineTo(a,b+r);shape.quadraticCurveTo(a,b,a+r,b);
    const g=new T.ExtrudeGeometry(shape,{depth:Math.max(.01,d-r),bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:r*.25,bevelThickness:r*.5,curveSegments:8});
    g.translate(0,0,-d/2);return mesh(g,mat,x,y,z);
  }
  function torus(mat,x,y,z,r,tube,rx=0,ry=0,rz=0,arc=Math.PI*2){return mesh(new T.TorusGeometry(r,tube,12,r>10?192:128,arc),mat,x,y,z,rx,ry,rz)}
  function flush(){for(const {geo,material,items} of lists.values()){const m=new T.InstancedMesh(geo,material,items.length);items.forEach((v,i)=>{temp.position.set(v[0],v[1],v[2]);temp.scale.set(v[3],v[4],v[5]);temp.rotation.set(v[6],v[7],v[8]);temp.updateMatrix();m.setMatrixAt(i,temp.matrix)});m.castShadow=true;m.receiveShadow=true;root.add(m)}lists.clear()}
  return {L,box,cyl,ball,mesh,bevel,torus,flush};
}

export function createDevice(THREE,type) {
  const T=THREE,root=new T.Group(),b=builder(T,root),{box,cyl,ball,bevel,torus,mesh}=b;
  const rotors=[];
  if(type==='server') {
    // Cabinet frame, recessed bays, glass side panel, rack handles.
    bevel('dark',0,1.62,0,1.54,3.18,1.30,.09);
    box('black',0,1.64,.675,1.34,2.92,.04);
    for(const x of [-.73,.73]){box('silver',x,1.64,.71,.055,3.08,.085);box('graphite',x,1.64,-.66,.07,3.08,.08);for(let i=0;i<14;i++)box('black',x,.23+i*.215,.76,.023,.043,.014)}
    box('mint',-.67,1.66,.766,.014,2.94,.015);box('lilac',.67,1.66,.766,.014,2.94,.015);
    for(let i=0;i<6;i++) {
      const y=.36+i*.43;
      box('graphite',0,y,.707,1.25,.345,.15);
      box('black',-.12,y,.792,.84,.258,.015);
      for(let row=0;row<3;row++)for(let col=0;col<9;col++)box('silver',-.49+col*.086,y-.078+row*.077,.805,.037,.014,.008);
      box('mint',.45,y+.055,.804,.045,.045,.012);box(i%2?'white':'lilac',.53,y+.055,.805,.021,.021,.012);
      box('black',.46,y-.055,.803,.16,.035,.015);
      box('silver',-.58,y,.81,.035,.22,.11);box('silver',.58,y,.81,.035,.22,.11);
      box('black',-.58,y,.876,.018,.12,.014);box('black',.58,y,.876,.018,.12,.014);
    }
    box('graphite',0,3.14,.70,1.31,.16,.10);box('white',-.35,3.145,.762,.36,.024,.015);box('mint',.51,3.145,.764,.09,.025,.015);
    box('black',0,.10,.71,1.35,.12,.09);for(let i=0;i<6;i++)box('graphite',-.48+i*.19,.10,.765,.10,.05,.012);
    // Visible right-side cooling fans and vent ribs.
    box('glass',.782,1.63,-.04,.022,2.79,1.09);
    for(let i=0;i<3;i++){
      const y=.65+i*.91;
      const fan=new T.Group();fan.position.set(.805,y,-.04);fan.rotation.y=Math.PI/2;
      const ring=new T.Mesh(new T.TorusGeometry(.29,.018,12,96),b.L.mat.graphite);fan.add(ring);
      const hub=new T.Mesh(new T.CylinderGeometry(.065,.065,.06,32),b.L.mat.silver);hub.rotation.x=Math.PI/2;fan.add(hub);
      // Curved aerodynamic blades, instanced in one draw call per fan.
      const bladeShape=new T.Shape();bladeShape.moveTo(.035,.015);bladeShape.bezierCurveTo(.14,.01,.28,.11,.20,.215);bladeShape.bezierCurveTo(.18,.15,.10,.10,.035,.075);bladeShape.closePath();
      const bladeGeo=new T.ExtrudeGeometry(bladeShape,{depth:.012,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:8,steps:1});
      const blades=new T.InstancedMesh(bladeGeo,b.L.mat.graphite,7),bladeTransform=new T.Object3D();
      for(let j=0;j<7;j++){bladeTransform.rotation.z=j*Math.PI*2/7;bladeTransform.updateMatrix();blades.setMatrixAt(j,bladeTransform.matrix)}
      fan.add(blades);
      root.add(fan);rotors.push(fan);ball('mint',.83,y,-.04,.027);
    }
    // Rear power couplings, structural foot blocks and top radiator.
    for(let i=0;i<11;i++)box('black',-.57+i*.115,3.237,-.02,.037,.018,.9);
    for(const x of [-.56,.56])for(const z of [-.46,.46])box('black',x,.025,z,.24,.08,.23);
  } else if(type==='pc') {
    // Wide tapered-looking metal display, elevated panel, floating side strips.
    bevel('graphite',0,1.43,0,2.12,1.33,.16,.08);
    box('black',0,1.44,.107,1.96,1.17,.025);
    const display=mesh(new T.PlaneGeometry(1.85,1.04),'screen',0,1.47,.125);
    box('mint',0,.799,.105,1.70,.012,.02);
    box('silver',0,1.06,-.15,.12,.72,.13);box('graphite',0,.58,-.06,.32,.74,.19);
    bevel('graphite',0,.15,.13,1.03,.12,.76,.055);
    box('mint',0,.20,.47,.63,.015,.016);
    // Keyboard slab with individual key caps and function row.
    bevel('dark',-.10,.105,1.03,1.68,.105,.65,.055);
    for(let row=0;row<4;row++)for(let col=0;col<13;col++)box(col===0?'silver':'graphite',-.83+col*.119,.173,.805+row*.12,.09,.029,.075);
    box('silver',-.10,.173,1.32,.62,.026,.068);
    bevel('graphite',1.13,.12,1.10,.25,.16,.40,.08);box('mint',1.13,.208,1.06,.014,.008,.12);
    // Compact desktop tower with ornamental cooling vents at the left.
    bevel('dark',-1.46,.49,-.02,.49,.9,.88,.06);
    box('glass',-1.455,.5,.445,.38,.72,.018);
    torus('mint',-1.455,.65,.461,.125,.013);torus('lilac',-1.455,.32,.461,.125,.013);
    for(let i=0;i<6;i++)box('silver',-1.46,.91,-.3+i*.105,.31,.015,.024);
    box('mint',-1.47,.91,.34,.06,.012,.025);
    // Small etched frame markings.
    for(let i=0;i<5;i++)box('silver',-.91+i*.055,2.045,.115,.026,.012,.01);
    box('black',.88,2.044,.115,.043,.026,.013);
    root.userData.display=display;
  } else if(type==='router') {
    // Layered body separated by luminous perimeter, four antennas.
    bevel('black',0,.12,0,1.94,.20,1.16,.10);
    bevel('graphite',0,.30,0,2.05,.23,1.20,.13);
    box('mint',0,.224,.604,1.76,.018,.018);
    box('mint',-.99,.224,0,.018,.018,1.02);box('lilac',.99,.224,0,.018,.018,1.02);
    bevel('silver',0,.439,-.02,1.78,.045,1.0,.07);
    // Ring lies on the lid, inset with concentric emission and radial marks.
    torus('mint',0,.478,-.02,.29,.014,Math.PI/2);torus('black',0,.476,-.02,.36,.009,Math.PI/2);
    for(let j=0;j<16;j++){const a=j*Math.PI/8;box('graphite',Math.sin(a)*.43,.477,-.02+Math.cos(a)*.43,.018,.008,.052,0,a,0)}
    for(const x of [-.83,.83])for(const z of [-.43,.43]){
      cyl('black',x,.49,z,.075,.12);cyl('silver',x,.56,z,.049,.05);
      const ant=bevel('dark',x,.98,z,.072,.82,.072,.025);ant.rotation.z=x<0?-.08:.08;
      box('lilac',x+(x<0?.025:-.025),1.19,z+.04,.016,.21,.01);
    }
    for(let i=0;i<5;i++){box('black',-.58+i*.28,.30,.622,.19,.10,.02);box(i===4?'lilac':'mint',-.58+i*.28,.38,.624,.038,.02,.01)}
    for(let i=0;i<10;i++)box('black',-.65+i*.144,.475,-.40,.05,.009,.14);
    for(const x of [-.7,.7])box('black',x,.025,.02,.22,.08,.6);
  } else {
    // Rack switch: chunky side ears, 16 physical ethernet sockets.
    bevel('graphite',0,.31,0,2.48,.49,1.18,.07);
    box('black',0,.29,.615,2.27,.31,.025);
    for(const x of [-1.27,1.27]){box('silver',x,.31,.50,.14,.41,.12);for(const y of [.19,.42])cyl('black',x,y,.57,.023,.012,Math.PI/2)}
    for(let row=0;row<2;row++)for(let col=0;col<8;col++){
      const x=-.92+col*.225,y=.21+row*.15;
      box('silver',x,y,.64,.177,.115,.04);box('black',x,y,.669,.144,.08,.018);
      for(let c=0;c<4;c++)box('white',x-.048+c*.032,y+.028,.684,.009,.023,.007);
      box((row+col)%4?'mint':'lilac',x+.075,y+.048,.686,.016,.012,.007);
    }
    box('mint',1.05,.34,.651,.035,.045,.018);box('white',1.05,.24,.651,.035,.025,.018);
    for(let i=0;i<15;i++)box('black',-.98+i*.14,.565,-.04,.055,.012,.71);
    box('lilac',0,.572,-.48,1.96,.01,.017);
    for(const x of [-.97,.97])for(const z of [-.37,.37])box('black',x,.035,z,.17,.09,.17);
  }
  b.flush();
  const bottom=new T.Box3().setFromObject(root).min.y;
  if(Number.isFinite(bottom)&&bottom!==0)for(const child of root.children)child.position.y-=bottom;
  root.userData.animate=(time,delta)=>{
    b.L.mat.screen.uniforms.time.value=time;
    for(const f of rotors)f.rotation.z+=delta*3.4;
  };
  return root;
}

export function createArchitecture(THREE) {
  const T=THREE,root=new T.Group(),b=builder(T,root),{box,cyl,torus,mesh}=b;
  root.name='PACKET cathedral / procedural environment';
  const overhead=new T.Group();overhead.name='Overhead arches, ceiling and cable conduits';
  const ceiling=builder(T,overhead);root.add(overhead);root.userData.overhead=overhead;
  // A monumental chamber frames the open laboratory. All furniture is >16m
  // from its center. Light-colored trims provide readable cinematic silhouettes.
  box('dark',0,-.50,-4,64,.65,92);
  box('graphite',0,-.15,-5,28,.12,72);
  const panels=[];
  for(const side of [-1,1]) {
    for(let i=0;i<8;i++) {
      const x=side*20.8,z=23-i*8.4;
      box('black',x,4.8,z,3.5,9.6,3.1);
      box('graphite',x,9.75,z,4,.30,3.7);
      box('silver',x-side*1.77,4.9,z,.12,9.5,3.2);
      box('mint',x-side*1.85,4.8,z-1.35,.045,8.8,.045);
      box('lilac',x-side*1.85,4.8,z+1.35,.045,8.8,.045);
      // Illuminated inner face. Dense bays read like server drawers at distance.
      for(let row=0;row<14;row++) {
        const y=.5+row*.64;
        box('graphite',x-side*1.79,y,z,.10,.49,2.50);
        box('black',x-side*1.86,y,z,.04,.31,2.17);
        for(let col=0;col<5;col++)box((row+col)%5===0?'lilac':'mint',x-side*1.9,y+.10,z-.88+col*.40,.025,.026,.15);
        box('silver',x-side*1.92,y-.11,z-.75,.04,.035,.29);
      }
      // Tower fin and pedestal beyond the banks.
      box('graphite',side*25,7.3,z,1.4,14.6,1.2);
      box('white',side*24.23,7.3,z,.11,13.4,.12);
      box('black',side*25,1,z,3.6,2,4.2);
      box('mint',side*25,2.02,z+2.13,3.3,.05,.04);
      // Floor channel near hardware; center stays visually unobstructed.
      box('black',side*17.35,-.035,z,.48,.04,7.9);
      box(i%2?'mint':'lilac',side*17.35,-.008,z,.055,.025,7.6);
    }
    // Suspended parallel cable conduit frames.
    for(let i=0;i<4;i++)ceiling.box('graphite',side*(17+i*.8),15.5,-7,.33,.33,76);
    ceiling.box('mint',side*17,15.27,-7,.035,.03,76);
    for(let z=-36;z<30;z+=7)ceiling.box('silver',side*18.2,15.65,z,4,.16,.14);
  }
  // Repeated arches make a clear vanishing point and deep parallax.
  for(let i=0;i<7;i++) {
    const z=24-i*11;
    const arch=ceiling.torus('graphite',0,0,z,24,.36,0,0,0,Math.PI);
    arch.castShadow=false;
    const trim=ceiling.torus(i%2?'lilac':'mint',0,0,z+.40,23.6,.027,0,0,0,Math.PI);trim.castShadow=false;
    for(const x of [-24,24])ceiling.box('silver',x,2.1,z,.56,4.2,.68);
  }
  // Rear stage, ascending steps and immense gate at the far end.
  for(let i=0;i<6;i++)box('graphite',0,.12+i*.23,-29-i*1.20,23-i*.5,.23,1.22);
  box('black',0,8,-40,25,16,1.1);
  box('glass',0,8,-39.4,16.4,14,.08);
  for(let i=0;i<9;i++) {
    const y=1.4+i*1.65;
    box('graphite',0,y,-39.25,16.7,.20,.25);
    box('mint',0,y+.13,-39.08,16.3,.027,.028);
  }
  for(const side of [-1,1]){
    box('silver',side*9.5,8.5,-39,1.1,17,1.3);
    box('white',side*8.89,8.5,-38.3,.055,15.7,.04);
  }
  // Huge orbiting gate rings, far behind the lab rather than obstructing it.
  const rings=new T.Group();rings.position.set(0,10,-38.7);
  for(let i=0;i<3;i++) {
    const r=new T.Mesh(new T.TorusGeometry(5.4+i*.5,.035,12,160,Math.PI*1.6),i%2?b.L.mat.lilac:b.L.mat.mint);
    r.rotation.z=i*1.7;rings.add(r);
  }
  root.add(rings);
  // Ceiling ribs with a clear bright center stripe.
  for(let z=-40;z<34;z+=8){ceiling.box('graphite',0,23.1,z,37,.25,.20);ceiling.box('white',0,22.93,z,15,.028,.03)}
  for(const x of [-3.7,3.7])ceiling.box('mint',x,23,-7,.035,.05,76);
  // Floor grooves, only around the edges of the central world.
  for(let z=-38;z<=34;z+=4){box('graphite',0,-.063,z,58,.015,.015);for(const s of [-1,1])box('white',s*15,-.045,z,.8,.012,.025)}
  for(let x=-28;x<=28;x+=4)box('graphite',x,-.06,-5,.015,.015,80);
  b.flush();
  ceiling.flush();
  root.userData.animate=(time,delta)=>{rings.children.forEach((r,i)=>r.rotation.z+=delta*(i%2?-.07:.04));};
  return root;
}
