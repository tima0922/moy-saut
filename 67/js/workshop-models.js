import * as THREE from 'three';

const vector = (x,y,z) => new THREE.Vector3(x,y,z);
const cylinders = [-1.29,-.43,.43,1.29];
const tau = 2*Math.PI;

export function buildWorkshopModel(spec) {
  const root = new THREE.Group(), stand = new THREE.Group();
  root.add(stand);
  const palette = {
    alloy:[0x899e99,.62,.38], steel:[0xabb7b5,.78,.29], dark:[0x283735,.29,.57],
    edges:[0x4d635d,.51,.48], rubber:[0x1e2220,.06,.79], red:[0x9e4b38,.35,.48],
    brass:[0xc9a466,.76,.32], bronze:[0x876b4f,.6,.43], paint:[0x53695a,.39,.44],
    light:[0xd6dcd1,.16,.42], bolt:[0xc8cfc8,.72,.34], activeBolt:[0xddf975,.21,.27],
  };
  const materials = Object.fromEntries(Object.entries(palette).map(([key,[color,metalness,roughness]])=>
    [key,new THREE.MeshStandardMaterial({color,metalness,roughness})]));
  materials.activeBolt.emissive.setHex(0x8bad29);
  materials.activeBolt.emissiveIntensity=.35;

  function mesh(group,geometry,position,metal,axis='z') {
    const object=new THREE.Mesh(geometry,materials[metal]);
    object.position.set(...position);
    if (axis==='x') object.rotation.y=Math.PI/2;
    if (axis==='y') object.rotation.x=-Math.PI/2;
    object.castShadow=true;
    object.receiveShadow=true;
    group.add(object);
    return object;
  }
  const box = (group,size,pos,metal) => mesh(group,new THREE.BoxGeometry(...size),pos,metal);
  function cylinder(group,radius,length,pos,metal,axis='y',sides=24,cap=radius) {
    const geometry=new THREE.CylinderGeometry(cap,radius,length,sides);
    geometry.rotateX(Math.PI/2);
    return mesh(group,geometry,pos,metal,axis);
  }
  function hollow(group,outer,inner,length,pos,metal,axis='z',teeth=0) {
    const shape = new THREE.Shape();
    if (teeth) {
      for (let i=0;i<=teeth*4;i++) {
        const a=tau*i/(teeth*4), r=outer*(i%4===1 || i%4===2 ? 1 : .91);
        if (!i) shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);
        else shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);
      }
    } else shape.absarc(0,0,outer,0,tau,false);
    const hole = new THREE.Path();
    hole.absarc(0,0,inner,0,tau,true);
    shape.holes.push(hole);
    return extrude(group,shape,length,pos,metal,axis);
  }
  function extrude(group,shape,length,pos,metal,axis,bevel=0) {
    const geometry=new THREE.ExtrudeGeometry(shape,{
      depth:length,steps:1,curveSegments:10,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,
    });
    geometry.translate(0,0,-length/2);
    return mesh(group,geometry,pos,metal,axis);
  }
  function rounded(group,width,height,length,pos,metal,axis='y',holes=[],round=.14) {
    const w=width/2,h=height/2,r=Math.min(round,w,h);
    const shape=new THREE.Shape();
    shape.moveTo(-w+r,-h);
    shape.lineTo(w-r,-h); shape.quadraticCurveTo(w,-h,w,-h+r);
    shape.lineTo(w,h-r); shape.quadraticCurveTo(w,h,w-r,h);
    shape.lineTo(-w+r,h); shape.quadraticCurveTo(-w,h,-w,h-r);
    shape.lineTo(-w,-h+r); shape.quadraticCurveTo(-w,-h,-w+r,-h);
    for (const [x,y,radius] of holes) {
      const cut=new THREE.Path();
      cut.absarc(x,y,radius,0,tau,true);
      shape.holes.push(cut);
    }
    return extrude(group,shape,length,pos,metal,axis,Math.min(.03,length*.15));
  }
  function tube(group,points,radius,metal,steps=25,sides=8) {
    const curve=new THREE.CatmullRomCurve3(points.map(pos=>vector(...pos)));
    return mesh(group,new THREE.TubeGeometry(curve,steps,radius,sides,false),[0,0,0],metal);
  }
  function torus(group,radius,wire,pos,metal,axis='z') {
    return mesh(group,new THREE.TorusGeometry(radius,wire,8,36),pos,metal,axis);
  }
  function link(group,a,b,r,metal) {
    const start=vector(...a),end=vector(...b),direction=end.clone().sub(start);
    const item=cylinder(group,r,direction.length(),start.add(end).multiplyScalar(.5).toArray(),metal);
    item.quaternion.setFromUnitVectors(vector(0,1,0),direction.normalize());
    return item;
  }
  const deckHoles = cylinders.map(x=>[x,0,.34]);

  const forms = {
    'valve-cover'(g) {
      rounded(g,3.40,1.30,.23,[0,0,0],'paint');
      for (const z of [-.44,.44]) for (const x of [-1.20,-.7,-.2,.3,.8,1.3]) {
        box(g,[.31,.052,.075],[x,.15,z],'edges');
      }
      rounded(g,1.21,.25,.035,[.31,.14,0],'alloy');
      cylinder(g,.17,.11,[-1.30,.18,.32],'dark','y',14);
    },
    ignition(g) {
      box(g,[2.94,.1,.20],[0,.035,0],'dark');
      for (const x of cylinders) {
        rounded(g,.31,.30,.14,[x,0,0],'rubber');
        cylinder(g,.066,.21,[x,-.16,0],'dark');
        box(g,[.15,.12,.14],[x,.03,.19],'red');
      }
    },
    plugs(g) {
      for (const x of cylinders) {
        cylinder(g,.081,.15,[x,0,0],'steel','y',6);
        cylinder(g,.049,.22,[x,.16,0],'light');
        cylinder(g,.044,.16,[x,-.15,0],'alloy');
        for (let y=-.21;y<-.08;y+=.032) torus(g,.045,.008,[x,y,0],'steel','y');
      }
    },
    intake(g) {
      rounded(g,3.31,.35,.16,[0,.10,.37],'alloy');
      rounded(g,3.28,.40,.42,[0,.25,-.63],'paint');
      cylinder(g,.21,.26,[1.68,.28,-.61],'alloy','x');
      for (const x of cylinders) tube(g,[[x,.10,.45],[x,-.09,.12],[x,-.18,-.30],[x,.12,-.66]],.13,'alloy');
    },
    exhaust(g) {
      rounded(g,3.27,.34,.13,[0,.037,-.37],'bronze');
      for (const x of cylinders) tube(g,[[x,.06,-.37],[x,.01,-.08],[x*.65,-.25,.14],[.22,-.46,.45]],.11,'bronze');
      hollow(g,.25,.17,.17,[.2,-.43,.48],'alloy');
    },
    filter(g) {
      cylinder(g,.24,.49,[0,0,0],'light','z');
      hollow(g,.23,.06,.06,[0,0,-.29],'steel');
      for (const a of [0,1,2,3,4,5,6,7]) {
        const side=box(g,[.036,.068,.24],[.231*Math.cos(a*tau/8),.231*Math.sin(a*tau/8),.09],'edges');
        side.rotation.z=a*tau/8;
      }
    },
    'timing-case'(g) {
      rounded(g,1.33,1.92,.18,[0,.09,0],'dark','x');
      for (const z of [-.35,.35]) cylinder(g,.28,.08,[.13,.56,z],'edges','x');
      box(g,[.09,.32,.66],[.13,-.27,0],'edges');
    },
    tensioner(g) {
      cylinder(g,.19,.20,[0,0,0],'alloy','x');
      hollow(g,.205,.082,.043,[.12,0,0],'steel','x');
    },
    'timing-belt'(g) {
      const track=[[0,-.62,-.17],[0,-.46,-.39],[0,.53,-.60],[0,.72,-.39],
        [0,.72,.39],[0,.50,.60],[0,-.38,.34],[0,-.62,.17],[0,-.62,-.17]];
      tube(g,track,.058,'rubber',52,7);
      for (const z of [-.34,.34]) hollow(g,.237,.095,.067,[-.07,.61,z],'alloy','x',22);
      hollow(g,.202,.077,.1,[-.09,-.67,0],'alloy','x',20);
    },
    'cam-caps'(g,p) {
      for (const x of [-1.39,0,1.39]) {
        rounded(g,.24,.35,.124,[x,0,p.z],'alloy');
        box(g,[.10,.035,.30],[x,.08,p.z],'edges');
      }
    },
    cam(g,p) {
      cylinder(g,.082,3.61,[0,0,p.z],'steel','x');
      for (const [i,x] of cylinders.entries()) {
        for (const dx of [-.15,.15]) {
          const a=i*1.51+(dx>0?.36:0);
          const lobe=cylinder(g,.148,.105,[x+dx,Math.cos(a)*.035,p.z+Math.sin(a)*.035],'alloy','x',18);
          lobe.scale.y=1.22;
        }
      }
    },
    followers(g) {
      for (const x of cylinders) for (const z of [-.34,.34]) for (const dx of [-.144,.144]) {
        cylinder(g,.091,.12,[x+dx,0,z],'steel');
        cylinder(g,.039,.19,[x+dx,-.1,z],'alloy');
      }
    },
    head(g) {
      rounded(g,3.47,1.38,.29,[0,0,0],'alloy','y',deckHoles.map(([x,z,r])=>[x,z,r*.60]));
      for (const x of cylinders) {
        for (const z of [-.36,.36]) rounded(g,.55,.21,.10,[x,.19,z],'edges','y',[],.06);
        hollow(g,.322,.225,.036,[x,-.17,0],'steel','y');
      }
      for (const z of [-.66,.66]) for (const x of [-1.47,-.96,-.48,0,.48,.96,1.47]) {
        box(g,[.085,.26,.09],[x,-.002,z],'edges');
      }
    },
    gasket(g) {
      rounded(g,3.46,1.31,.04,[0,0,0],'dark','y',deckHoles);
      for (const x of cylinders) hollow(g,.379,.344,.024,[x,.03,0],'steel','y');
      for (const x of [-1.71,-.87,0,.87,1.71]) for (const z of [-.49,.49]) {
        hollow(g,.067,.038,.02,[x,.032,z],'brass','y');
      }
    },
    sump(g) {
      rounded(g,3.02,1.23,.16,[0,-.04,0],'paint');
      rounded(g,2.23,1.05,.21,[-.24,-.17,0],'edges');
      for (const x of [-.69,-.36,0,.36,.69]) box(g,[.08,.044,.78],[x,.067,0],'dark');
      cylinder(g,.083,.10,[.69,-.31,.25],'steel','y',6);
    },
    pickup(g) {
      tube(g,[[-.66,.05,0],[-.41,.08,.12],[.50,.06,.38],[.78,0,.36]],.095,'alloy');
      hollow(g,.254,.11,.09,[-.66,-.05,0],'steel','y');
      for (const x of [-.77,-.69,-.61,-.53]) box(g,[.018,.027,.23],[x,-.094,0],'dark');
    },
    'oil-pump'(g) {
      cylinder(g,.28,.22,[0,0,0],'alloy','x',7);
      hollow(g,.219,.097,.07,[.16,0,0],'brass','x',16);
      cylinder(g,.105,.13,[.13,0,0],'steel','x',9);
    },
    bedplate(g) {
      rounded(g,3.35,1.22,.15,[0,-.04,0],'alloy','y',deckHoles);
      for (const x of [-1.7,-.85,0,.85,1.7]) box(g,[.14,.16,1.04],[x,.08,0],'edges');
    },
    'rod-cap'(g) {
      hollow(g,.181,.104,.16,[0,0,0],'steel','x',0);
      for (const z of [-.17,.17]) box(g,[.18,.144,.10],[0,-.035,z],'alloy');
    },
    piston(g) {
      cylinder(g,.322,.29,[0,.15,0],'alloy');
      for (const [i,y] of [.10,.19,.235].entries()) torus(g,.321,i===0?.022:.014,[0,y,0],i?'dark':'bronze','y');
      cylinder(g,.076,.74,[0,-.014,0],'steel','x');
      link(g,[0,-.01,0],[0,-.42,0],.097,'steel');
      hollow(g,.169,.102,.16,[0,-.42,0],'alloy','x');
    },
    crank(g) {
      cylinder(g,.099,3.77,[0,0,0],'steel','x');
      for (const [i,x] of cylinders.entries()) {
        const side=i===0||i===3 ? 1 : -1;
        for (const dx of [-.24,.24]) {
          const mass=cylinder(g,.237,.15,[x+dx,.13*side,0],'edges','x',11);
          mass.scale.y=1.2;
          cylinder(g,.126,.17,[x+dx,0,0],'steel','x');
        }
        cylinder(g,.10,.314,[x,.154*side,0],'steel','x');
      }
      hollow(g,.223,.098,.10,[1.87,0,0],'steel','x',21);
    },
    inserts(g) {
      for (const x of [-1.7,-.85,0,.85,1.7]) hollow(g,.162,.122,.203,[x,0,0],'brass','x');
    },
    wheel(g) {
      torus(g,.68,.175,[0,0,.025],'rubber');
      torus(g,.65,.102,[0,0,-.16],'rubber');
      hollow(g,.583,.43,.19,[0,0,.052],'steel');
      cylinder(g,.207,.10,[0,0,.18],'alloy','z');
      for (let i=0;i<10;i++) {
        const a=i*tau/10;
        const spoke=box(g,[.36,.080,.145],[.34*Math.cos(a),.34*Math.sin(a),.11],'alloy');
        spoke.rotation.z=a;
      }
      for (let i=0;i<32;i++) {
        const a=i*tau/32;
        const tread=box(g,[.067,.015,.213],[.846*Math.cos(a),.846*Math.sin(a),-.041],'dark');
        tread.rotation.z=a-Math.PI/2;
      }
    },
    caliper(g) {
      rounded(g,.39,.59,.37,[0,0,0],'red','z');
      rounded(g,.24,.42,.12,[-.07,0,-.25],'dark','z');
      cylinder(g,.11,.095,[.077,-.068,.23],'alloy','z');
    },
    disc(g) {
      hollow(g,.614,.211,.097,[0,0,0],'steel');
      cylinder(g,.25,.155,[0,0,-.03],'edges','z');
      for (let i=0;i<18;i++) {
        const a=i*tau/18;
        const slit=box(g,[.095,.019,.013],[.478*Math.cos(a),.478*Math.sin(a),.052],'dark');
        slit.rotation.z=a+.45;
      }
    },
    hub(g) {
      hollow(g,.284,.075,.097,[0,0,0],'alloy');
      hollow(g,.192,.102,.225,[0,0,-.10],'steel');
      for (let i=0;i<5;i++) {
        const a=i*tau/5;
        cylinder(g,.034,.14,[.212*Math.cos(a),.212*Math.sin(a),.084],'steel','z',8);
      }
    },
    'hub-bearing'(g,p) {
      const axis=p.id==='strut-bearing' ? 'y' : 'z';
      hollow(g,.252,.187,.105,[0,0,0],'steel',axis);
      hollow(g,.142,.104,.128,[0,0,0],'alloy',axis);
      for (let i=0;i<12;i++) {
        const a=i*tau/12, x=.162*Math.cos(a), y=.162*Math.sin(a);
        mesh(g,new THREE.SphereGeometry(.036,9,7),axis==='y' ? [x,0,y] : [x,y,0],'brass');
      }
    },
    'tie-rod'(g) {
      link(g,[-.60,0,-.24],[.57,0,.04],.061,'alloy');
      cylinder(g,.129,.16,[.56,.003,.06],'dark');
      cylinder(g,.053,.18,[.56,.12,.06],'steel','y',8);
    },
    'anti-roll'(g) {
      link(g,[-.07,-.51,.04],[.023,.48,-.10],.047,'steel');
      for (const [x,y,z] of [[-.07,-.51,.04],[.023,.48,-.10]]) cylinder(g,.112,.13,[x,y,z],'edges','z');
    },
    knuckle(g) {
      hollow(g,.408,.254,.301,[0,0,.02],'alloy','z',8);
      for (const [x,y] of [[0,.50],[-.40,.03],[.11,-.49]]) {
        link(g,[x*.36,y*.55,0],[x,y,0],.115,'edges');
        hollow(g,.136,.060,.14,[x,y,.07],'alloy');
      }
    },
    'ball-joint'(g) {
      cylinder(g,.144,.22,[0,0,0],'dark');
      cylinder(g,.068,.25,[0,.214,0],'steel','y',11,.052);
      rounded(g,.46,.34,.082,[0,-.12,.02],'alloy');
    },
    arm(g) {
      for (const x of [-.67,.67]) {
        link(g,[x,0,-.64],[0,0,.73],.13,'edges');
        hollow(g,.18,.086,.27,[x,0,-.64],'rubber','x');
      }
      link(g,[-.55,0,-.42],[.55,0,-.42],.12,'alloy');
    },
    'strut-brace'(g) {
      for (const z of [-.16,.16]) rounded(g,.29,.47,.107,[.24,-.02,z],'alloy','z',[],.07);
      hollow(g,.209,.122,.13,[0,.06,0],'edges','y');
    },
    'top-mount'(g) {
      cylinder(g,.32,.158,[0,0,0],'alloy','y',12);
      hollow(g,.251,.094,.119,[0,.10,0],'rubber','y');
    },
    'coil-spring'(g) {
      const points=Array.from({length:82},(_,i)=>{
        const t=i/81, a=t*5.2*tau;
        return [.348*Math.cos(a),(t-.5)*1.25,.348*Math.sin(a)];
      });
      tube(g,points,.058,'red',112,7);
    },
    boot(g) {
      cylinder(g,.155,.61,[0,.02,0],'rubber');
      for (let y=-.242;y<.29;y+=.078) torus(g,.162,.028,[0,y,0],'dark','y');
      cylinder(g,.108,.14,[0,.31,0],'brass');
    },
    damper(g) {
      cylinder(g,.132,1.26,[0,-.31,0],'paint');
      cylinder(g,.064,1.58,[0,.56,0],'steel');
      hollow(g,.373,.108,.058,[0,-.23,0],'alloy','y');
      rounded(g,.27,.32,.25,[0,-.89,0],'edges','z');
    },
    bellhousing(g) {
      hollow(g,.879,.65,.31,[0,0,0],'alloy','x',10);
      hollow(g,.648,.524,.41,[.29,0,0],'edges','x');
      for (let i=0;i<6;i++) {
        const a=i*tau/6;
        link(g,[-.16,.79*Math.cos(a),.79*Math.sin(a)],[.44,.56*Math.cos(a),.56*Math.sin(a)],.059,'alloy');
      }
    },
    'top-case'(g) {
      rounded(g,3.38,1.61,.24,[0,.063,0],'paint','y',[],.21);
      const ribs=Array.from({length:8},(_,i)=>(i-3.5)*.397);
      for (const x of ribs) rounded(g,.085,1.21,.13,[x,.24,0],'alloy','y',[],.036);
      rounded(g,1.00,.35,.13,[.38,.28,0],'edges');
    },
    'end-cover'(g) {
      rounded(g,1.28,1.42,.24,[0,.02,0],'alloy','x',[],.25);
      for (const y of [-.35,.36]) cylinder(g,.29,.095,[.17,y,0],'edges','x');
    },
    selector(g) {
      for (const z of [-.28,.30]) cylinder(g,.049,2.92,[0,.203,z],'steel','x');
      for (const [x,z] of [[-.73,-.28],[.25,.30],[1.12,-.28]]) {
        box(g,[.13,.33,.19],[x,.05,z],'alloy');
        hollow(g,.318,.263,.09,[x,-.16,.02],'brass','x');
      }
    },
    gear(g,p) {
      hollow(g,p.radius,.111,.15,[0,0,0],'steel','x',p.teeth);
    },
    'gear-pair'(g,p) {
      const low=p.radius,high=.68-low;
      hollow(g,high,.09,.163,[0,.35,-.035],'alloy','x',p.teeth-2);
      hollow(g,low,.10,.177,[0,-.34,.05],'steel','x',p.teeth);
      hollow(g,low*.57,.106,.059,[.12,-.34,.05],'edges','x',16);
    },
    'sync-sleeve'(g) {
      hollow(g,.29,.163,.26,[0,0,0],'edges','x',30);
      hollow(g,.300,.149,.061,[.155,0,0],'alloy','x',27);
    },
    'sync-ring'(g) {
      hollow(g,.267,.179,.088,[0,0,0],'brass','x',28);
      hollow(g,.237,.169,.039,[.063,0,0],'bronze','x');
    },
    shaft(g) {
      cylinder(g,.109,3.82,[0,0,0],'steel','x');
      for (const x of [-1.84,-.90,-.13,.59,1.61]) cylinder(g,.151,.18,[x,0,0],'alloy','x');
      for (const x of [-1.67,1.74]) hollow(g,.144,.097,.25,[x,0,0],'brass','x',16);
    },
    'shaft-bearings'(g) {
      for (const x of [-1.59,1.55]) for (const y of [-.34,.35]) {
        hollow(g,.219,.138,.154,[x,y,.021],'steel','x');
        hollow(g,.135,.112,.181,[x,y,.021],'alloy','x');
      }
    },
  };

  if (spec.id==='engine') {
    rounded(stand,3.48,1.47,.64,[0,.008,0],'edges','y',deckHoles);
    rounded(stand,3.54,1.48,.08,[0,.33,0],'alloy','y',deckHoles);
    for (const x of cylinders) hollow(stand,.343,.311,.615,[x,.017,0],'dark','y');
    for (const z of [-.74,.74]) for (const x of [-1.55,-1.02,-.51,0,.51,1.02,1.55]) {
      box(stand,[.074,.58,.084],[x,-.009,z],'alloy');
    }
  } else if (spec.id==='gearbox') {
    rounded(stand,3.36,1.58,.25,[0,-.78,0],'edges','y',[],.30);
    for (const z of [-.68,.68]) {
      rounded(stand,3.30,.38,.135,[0,-.57,z],'alloy','z',[],.15);
      for (const x of [-1.43,-.55,.55,1.43]) box(stand,[.12,.43,.082],[x,-.56,z*1.08],'edges');
    }
  } else {
    for (const z of [-.71,.71]) rounded(stand,1.8,.26,.092,[0,-1.55,z],'edges');
  }

  const items=new Map();
  function boltsFor(group,part,bounds) {
    const result=[];
    const size=bounds.getSize(vector(0,0,0));
    const center=bounds.getCenter(vector(0,0,0));
    for (let i=0;i<part.bolts;i++) {
      const s=i%2 ? 1 : -1, a=i/part.bolts*tau;
      let position=[0,0,0], axis=part.boltAxis ?? 'y';
      if (part.id==='head') position=[(Math.floor(i/2)-2)*.72,bounds.max.y+.07,s*.553];
      else if (part.id==='wheel') position=[.209*Math.cos(a),.209*Math.sin(a),.30];
      else if (axis==='z') position=[center.x+Math.cos(a)*size.x*.33,center.y+Math.sin(a)*size.y*.32,bounds.max.z+.07];
      else if (axis==='x') position=[bounds.max.x+.068,center.y+Math.cos(a)*size.y*.35,center.z+Math.sin(a)*size.z*.35];
      else if (part.bolts===1) position=[center.x,bounds.max.y+.063,center.z];
      else position=[center.x+(Math.floor(i/2)/(Math.ceil(part.bolts/2)-1||1)-.5)*size.x*.79,
        bounds.max.y+.056,center.z+s*size.z*.37];
      if (part.id==='plugs') position=[cylinders[i],bounds.max.y+.035,0];
      const bolt=cylinder(group,part.id==='wheel'?.064:.047,.068,position,'bolt',axis,6);
      bolt.userData.bolt=i;
      result.push(bolt);
    }
    return result;
  }

  for (const part of spec.parts) {
    const group=new THREE.Group();
    group.userData.partId=part.id;
    forms[part.kind](group,part);
    const bounds=new THREE.Box3().setFromObject(group);
    const center=bounds.getCenter(vector(0,0,0));
    const bolts=boltsFor(group,part,bounds);
    group.position.set(...part.home);
    root.add(group);
    items.set(part.id,{part,group,bolts,center,bounds});
  }
  return {root,stand,items,materials};
}
