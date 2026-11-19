import * as THREE from 'three';
import { createWorld } from './world.js?v=040';
import { bakeParkedCar, batchSharedMeshes } from './garage-visuals.js?v=019';
import { CRANE, positionChain } from './crane-route.js';
import { buildWorkshopModel } from './workshop-models.js';
import { STATIONS } from './workshop-spec.js';
import { GRAPHICS, createMaterialQuality, renderRatio } from './graphics.js?v=033';
import { graphicsPreference } from './game-settings.js?v=037';

const v = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const lerp = THREE.MathUtils.lerp;
const cameraViews = {
  overview:[v(-5.7,2.95,5.4),v(0,.92,-.65)],
  engine:[v(-2.36,2.36,-3.54),v(0,.88,-1.34)],
  under:[v(-2.35,.62,-2.18),v(0,1.32,-.18)],
  lift:[v(-4.42,1.98,2.57),v(-.67,.91,.35)],
  stand:[v(5.7,2.59,-.66),v(3.65,1.26,-4.08)],
  desk:[v(-5.40,2.25,1.75),v(-2.60,1.04,-1.32)],
};
const ENGINE_HIGH=1.95;
const bayEngine=v(0,.70,-1.38);
const bayGearbox=v(0,.40,-.38);
const storedJack=v(3.64,0,3.15);
const couplingPositions=[[-.23,.57,-.78],[.23,.57,-.78],[-.23,.30,-.78],[.23,.30,-.78]];

function followPath(out,points,fraction) {
  const position=fraction*(points.length-1);
  const i=Math.min(Math.floor(position),points.length-2);
  out.copy(points[i]).lerp(points[i+1],position-i);
}

export function createServiceBay({host,canvas,map,marker,mode,onAction}) {
  const profile=GRAPHICS[graphicsPreference()] ?? GRAPHICS.integrated;
  const touch=matchMedia('(pointer: coarse)');
  let renderer;
  try {
    const context=canvas.getContext('webgl2',{antialias:false,powerPreference:'default'});
    if (context) {
      renderer=new THREE.WebGLRenderer({canvas,context});
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.03;
      renderer.shadowMap.enabled=Boolean(profile.shadows);
      renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate=false;
    }
  } catch {
    // The overhead layout keeps the same service actions available without WebGL.
  }
  const world=createWorld(renderer,{deferredEnvironment:true,deferredProps:true});
  const {scene,car,box,cylinder,mats}=world;
  const cameraHelp=host.parentElement.querySelector('.bay-camera-help');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const pointerOrbit=new THREE.Spherical(), orbitOffset=v();
  const camera=new THREE.PerspectiveCamera(56,1,.065,32);
  const aim=v();
  const nextEye=v(), nextAim=v(), projected=v(), frameTarget=v();
  let order, active=true, frame=0, clock=0, width=0, height=0, drag, transition, pose;
  let gpu=Boolean(renderer), shadowDirty=true;

  world.engine.visible=false;
  world.newPart.visible=world.dust.visible=false;
  world.door.position.y=0;
  world.key.shadow.mapSize.set(1024,1024);
  mats.paint.color.setHex(0x4f6968);
  world.fill.intensity=48;
  scene.fog=null;
  for (const x of [-3.75,3.75]) box(scene,[.16,.012,5.8],[x,.024,.93],mats.white).castShadow=false;
  world.textPlane(scene,'ДВИГАТЕЛЬ',1.10,.13,[2.72,.028,-4.15],[-Math.PI/2,0,0],'#d9e2db');
  world.textPlane(scene,'КОРОБКА',1.10,.13,[4.78,.028,-2.43],[-Math.PI/2,0,0],'#d9e2db');

  function makeUnit(id,scale) {
    const root=new THREE.Group(), model=buildWorkshopModel(STATIONS[id]);
    const bounds=new THREE.Box3().setFromObject(model.root);
    const assembled=bakeParkedCar(model.root);
    for (const mesh of assembled.children) mesh.castShadow=mesh.receiveShadow=true;
    assembled.position.copy(bounds.getCenter(v())).multiplyScalar(-scale);
    assembled.scale.setScalar(scale);
    root.add(assembled);
    scene.add(root);
    return {root,halfHeight:bounds.getSize(v()).y*scale*.5};
  }
  const engine=makeUnit('engine',.215), gearbox=makeUnit('gearbox',.229);
  const standEngine=v(CRANE.engineStand.x,1.125+engine.halfHeight,CRANE.engineStand.z);
  const standGearbox=v(4.95,1.16+gearbox.halfHeight,-3.38);
  for (const x of [4.68,5.22]) box(scene,[.145,.074,1.08],[x,1.125,-3.38],mats.rubber);

  const jack=new THREE.Group(), cradle=new THREE.Group();
  scene.add(jack);
  jack.add(cradle);
  for (const x of [-.32,.32]) {
    box(jack,[.12,.09,.85],[x,.105,0],mats.orange);
    for (const z of [-.29,.29]) cylinder(jack,.075,.075,.075,[x,.073,z],mats.rubber,[0,0,Math.PI/2],12);
  }
  box(jack,[.75,.12,.25],[0,.151,0],mats.orange);
  cylinder(jack,.081,.108,.29,[0,.23,0],mats.steel);
  const piston=cylinder(jack,.043,.043,1,[0,.50,0],mats.metal);
  box(cradle,[.52,.075,.57],[0,0,0],mats.dark);
  for (const x of [-.20,.20]) box(cradle,[.055,.09,.48],[x,.07,0],mats.orange);
  cylinder(jack,.021,.021,.62,[.32,.42,.35],mats.metal,[.57,0,0]);

  const driveShaft=new THREE.Group();
  car.add(driveShaft);
  cylinder(driveShaft,.057,.057,1.35,[0,.34,1.04],mats.steel,[Math.PI/2,0,0]);
  for (const z of [.36,1.71]) cylinder(driveShaft,.104,.104,.11,[0,.34,z],mats.metal,[Math.PI/2,0,0],12);
  box(driveShaft,[.16,.13,.25],[.17,.34,.42],mats.dark);
  const coupling=couplingPositions.map(([x,y,z])=>cylinder(car,.029,.029,.047,[x,y,z],mats.metal,[Math.PI/2,0,0],6));
  const engineSteps=['intake_duct','wiring','fuel_line','upper_hose','lower_hose','downpipe'].map(id=>world.partObjects.get(id).object);
  const batteryCable=box(car,[.027,.027,.14],[-.65,1.04,-1.43],mats.red);
  const tray=new THREE.Group();
  scene.add(tray);
  box(tray,[.57,.10,.42],[0,.075,0],mats.orange);
  box(tray,[.43,.02,.32],[0,.132,0],mats.black);

  batchSharedMeshes(scene);
  for (const root of [car,jack,engine.root,gearbox.root,world.lift,world.arms,world.crane]) batchSharedMeshes(root);
  if (renderer) {
    world.setTextureQuality('low');
    if (profile.lite) {
      world.fill.visible=false;
      const materials=createMaterialQuality();
      materials.collect(scene);
      materials.apply(true,2,renderer.capabilities.getMaxAnisotropy());
    }
    world.assetsReady.then(requestFrame);
  }

  function statePose(job) {
    const done = key => job?.done(key) ?? false;
    const liftStep=job?.steps.slice(0,job.state.index).findLast(step=>step.lift!==undefined);
    const raised=liftStep?.lift ? 1.42 : 0;
    const hood=done('hood-open') && !done('hood-close') ? (done('crane-catch') ? 1.54 : 1.11) : .02;
    const e=job?.unitLocation('engine'), g=job?.unitLocation('gearbox');
    const motor=e==='stand' ? standEngine.clone() : e==='crane' ? (done('engine-pickup') ? standEngine.clone() : bayEngine.clone()).setY(ENGINE_HIGH)
      : bayEngine.clone().add(v(0,raised,0));
    const gear=g==='stand' ? standGearbox.clone() : g==='jack'
      ? (done('gearbox-pickup') ? standGearbox.clone().setY(.40+gearbox.halfHeight) : v(0,.41+gearbox.halfHeight,1.06))
      : bayGearbox.clone().add(v(0,raised,0));
    const craneHeld=(done('crane-catch') && !done('engine-dock')) || (done('engine-pickup') && !done('crane-away'));
    const crane=craneHeld ? v(motor.x,0,motor.z-CRANE.reach) : e==='stand' ? v(standEngine.x,0,standEngine.z-CRANE.reach)
      : v(CRANE.park.x,0,CRANE.park.z);
    const jackHeld=(done('jack-catch') && !done('gearbox-dock')) || (done('gearbox-pickup') && !done('jack-away'));
    const jackPosition=jackHeld ? v(gear.x,0,gear.z) : g==='stand' ? v(standGearbox.x,0,standGearbox.z+.48) : storedJack.clone();
    const jackHeight=jackHeld ? Math.max(.35,gear.y-gearbox.halfHeight-.033) : .35;
    return {raised,hood,motor,gear,crane,craneHeld,jackPosition,jackHeight,jackHeld,engineYaw:Math.PI/2,gearboxYaw:-Math.PI/2};
  }

  function setParts() {
    const done=id=>order?.done(id) ?? false;
    const {id,fastener}={id:order?.current?.id,fastener:order?.state.fastener ?? 0};
    batteryCable.visible=!done('power-off') || done('power-on');
    for (const part of engineSteps) part.visible=!done('engine-lines-out') || done('engine-lines-in');
    driveShaft.visible=!done('gearbox-links-out') || done('gearbox-links-in');
    tray.visible=id==='gearbox-drain' || id==='engine-drain';
    tray.position.set(id==='gearbox-drain' ? .24 : .65,0,id==='gearbox-drain' ? -.12 : -1.82);
    const detached=done('engine-separate') || done('gearbox-mounts-out');
    const attached=done('engine-join') || done('gearbox-mounts-in');
    for (let i=0;i<4;i++) {
      world.bolts.get('mount_'+i).visible=done('engine-mounts-in') || (id==='engine-mounts-in' ? i<fastener
        : id==='engine-mounts-out' ? i>=fastener : !done('engine-mounts-out'));
      coupling[i].visible=attached || (id==='engine-join' || id==='gearbox-mounts-in' ? i<fastener
        : id==='engine-separate' || id==='gearbox-mounts-out' ? i>=fastener : !detached);
    }
  }

  function mapPosition(node,x,z) {
    node.style.left=(50+x*6)+'%';
    node.style.top=(50+z*5.5)+'%';
  }
  const mapEngine=map.querySelector('[data-map-engine]'), mapGearbox=map.querySelector('[data-map-gearbox]');

  function applyPose(state) {
    car.position.y=world.arms.position.y=state.raised;
    world.hood.rotation.x=state.hood;
    engine.root.position.copy(state.motor);
    engine.root.rotation.y=state.engineYaw;
    gearbox.root.position.copy(state.gear);
    gearbox.root.rotation.y=state.gearboxYaw;
    world.crane.position.copy(state.crane);
    positionChain(world,state.craneHeld ? state.motor.y+engine.halfHeight-.22 : undefined);
    jack.position.copy(state.jackPosition);
    cradle.position.y=state.jackHeight;
    piston.position.y=(state.jackHeight+.23)*.5;
    piston.scale.y=Math.max(.12,state.jackHeight-.23);
    world.contact.material.opacity=1-state.raised*.34;
    if (!gpu) {
      mapPosition(mapEngine,state.motor.x,state.motor.z);
      mapPosition(mapGearbox,state.gear.x,state.gear.z);
    }
    shadowDirty=true;
  }

  function lerpPose(from,to,t,id) {
    const a=t*t*(3-2*t);
    const motor=from.motor.clone().lerp(to.motor,a), gear=from.gear.clone().lerp(to.gear,a);
    let crane=from.crane.clone().lerp(to.crane,a), jackPosition=from.jackPosition.clone().lerp(to.jackPosition,a);
    let jackHeight=lerp(from.jackHeight,to.jackHeight,a);
    if (id==='engine-dock' || id==='engine-seat') {
      const clear=v(0,ENGINE_HIGH,-4.45);
      const over=to.motor.clone().setY(ENGINE_HIGH);
      followPath(motor,[from.motor,clear,over,to.motor],a);
      crane=v(motor.x,0,motor.z-CRANE.reach);
    }
    if (id==='gearbox-lower' || id==='gearbox-seat') {
      const pulling=id==='gearbox-lower';
      const seated=pulling ? from.gear : to.gear;
      const clear=v(seated.x,seated.y,1.0);
      const approach=v(0,.41+gearbox.halfHeight,1.06);
      const path=pulling ? [from.gear,clear,to.gear]
        : [from.gear,v(4.8,from.gear.y,1.89),approach,clear,to.gear];
      followPath(gear,path,a);
      jackPosition=v(gear.x,0,gear.z);
      jackHeight=Math.max(.35,gear.y-gearbox.halfHeight-.033);
    }
    if (id==='gearbox-dock' || id==='gearbox-pickup') {
      const docking=id==='gearbox-dock';
      const low=v(standGearbox.x,.41+gearbox.halfHeight,standGearbox.z);
      const path=docking ? [from.gear,v(1.2,from.gear.y,2.25),v(4.75,from.gear.y,2.25),low,to.gear] : [from.gear,to.gear];
      followPath(gear,path,a);
      jackPosition=v(gear.x,0,gear.z);
      jackHeight=Math.max(.35,gear.y-gearbox.halfHeight-.033);
    }
    return {raised:lerp(from.raised,to.raised,a),hood:lerp(from.hood,to.hood,a),motor,gear,crane,
      craneHeld:from.craneHeld || to.craneHeld,jackPosition,jackHeight,
      engineYaw:lerp(from.engineYaw,to.engineYaw,a),gearboxYaw:lerp(from.gearboxYaw,to.gearboxYaw,a)};
  }

  function targetPoint() {
    const next=order?.current;
    if (!next || transition) return null;
    const {id,zone}=next, bolt=order.state.fastener;
    if (id==='engine-mounts-out' || id==='engine-mounts-in') return world.bolts.get('mount_'+bolt).getWorldPosition(frameTarget);
    if (next.count && zone==='under') return coupling[bolt].getWorldPosition(frameTarget);
    if (zone==='stand') return frameTarget.copy(id.startsWith('engine') ? engine.root.position : gearbox.root.position).add(v(0,.26,0));
    if (zone==='under') return frameTarget.copy(gearbox.root.position).add(v(-.16,-.14,0));
    if (zone==='lift') return frameTarget.set(-2.73,1.40,.075);
    if (zone==='desk') return frameTarget.set(-3.85,1.16,-1.75);
    return frameTarget.set(id.startsWith('power-') ? -.65 : 0,1.03, -1.52);
  }

  function drawMarker() {
    const point=targetPoint();
    marker.hidden=!point;
    if (!point) return;
    if (!gpu) {
      mapPosition(marker,point.x,point.z);
      return;
    }
    projected.copy(point).project(camera);
    marker.hidden=projected.z>1 || Math.abs(projected.x)>.94 || Math.abs(projected.y)>.91;
    marker.style.left=(50+projected.x*50)+'%';
    marker.style.top=(50-projected.y*50)+'%';
  }

  function requestFrame() {
    if (active && !frame) frame=requestAnimationFrame(draw);
  }

  function draw(now) {
    frame=0;
    if (!active || !width || !height) return;
    if (transition) {
      const fraction=Math.min(1,(now-transition.start)/transition.duration);
      if (fraction<1) {
        applyPose(lerpPose(transition.from,pose,fraction,transition.id));
        if (transition.id==='start-test') {
          const shake=(1-fraction)*Math.sin(fraction*58);
          car.rotation.z=.005*shake;
          engine.root.position.x=.009*shake;
        }
      }
      else finishMovement();
    }
    const rate=motion.matches ? 1 : 1-Math.exp(-Math.max(.016,Math.min(.10,(now-clock)/1000))*11);
    clock=now;
    camera.position.lerp(nextEye,rate);
    aim.lerp(nextAim,rate);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    if (gpu) {
      renderer.shadowMap.needsUpdate=shadowDirty;
      renderer.render(scene,camera);
      shadowDirty=false;
    }
    drawMarker();
    if (transition || camera.position.distanceToSquared(nextEye)>.0001 || aim.distanceToSquared(nextAim)>.0001) requestFrame();
  }

  function resize() {
    width=host.clientWidth;
    height=host.clientHeight;
    if (!width || !height) return;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    if (gpu) {
      renderer.setPixelRatio(Math.min(renderRatio(profile,width,height,devicePixelRatio,touch.matches,false),1250/width,1.25));
      renderer.setSize(width,height,false);
    }
    requestFrame();
  }

  function setDisplay() {
    canvas.hidden=!gpu;
    map.hidden=gpu;
    mode.textContent=gpu ? '3D-бокс' : 'Вид сверху';
    host.closest('.bay-visual').classList.toggle('bay-overhead',!gpu);
    cameraHelp.textContent=gpu ? 'Перетащи сцену для обзора. Нажми на метку или используй карточку заказа.'
      : 'М — двигатель, К — коробка. Нажми на метку или используй карточку заказа.';
    if (pose) applyPose(pose);
    resize();
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();gpu=false;setDisplay();});
  canvas.addEventListener('webglcontextrestored',()=>{gpu=true;setDisplay();});
  new ResizeObserver(resize).observe(host);
  setDisplay();

  function focus(zone='overview',immediate=false) {
    const [eye,target]=cameraViews[zone] ?? cameraViews.overview;
    nextEye.copy(eye);
    nextAim.copy(target);
    if (zone==='engine' && pose?.raised) nextAim.y+=pose.raised*.56;
    if (immediate) {
      camera.position.copy(nextEye);
      aim.copy(nextAim);
    }
    requestFrame();
  }

  canvas.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    drag={x:event.clientX,y:event.clientY};
    pointerOrbit.setFromVector3(orbitOffset.copy(nextEye).sub(nextAim));
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if (!drag || transition) return;
    pointerOrbit.theta-=(event.clientX-drag.x)*.009;
    pointerOrbit.phi=THREE.MathUtils.clamp(pointerOrbit.phi-(event.clientY-drag.y)*.009,.32,1.94);
    drag={x:event.clientX,y:event.clientY};
    nextEye.setFromSpherical(pointerOrbit).add(nextAim);
    nextEye.clamp(v(-6.4,.36,-7.6),v(6.4,4.65,7.6));
    requestFrame();
  });
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  host.addEventListener('keydown',event=>{
    if (event.target!==canvas || event.code!=='KeyE' || event.repeat) return;
    event.preventDefault();
    onAction();
  });

  function finishMovement() {
    if (!transition) return;
    const {resolve}=transition;
    transition=undefined;
    car.rotation.z=0;
    applyPose(pose);
    resolve();
  }

  focus('overview',true);
  return {
    focus,
    visible(value) {
      active=value;
      if (active) resize();
      else {
        finishMovement();
        cancelAnimationFrame(frame);
        frame=0;
      }
    },
    update(job,action) {
      finishMovement();
      order=job;
      const previous=pose;
      pose=statePose(job);
      setParts();
      const duration=action?.lift!==undefined ? 1250 : action?.id==='gearbox-dock' ? 1900
        : /engine-(dock|seat|raise|pickup)|gearbox-(seat|lower|pickup)|start-test/.test(action?.id) ? 1400
        : /hood-|crane-|jack-/.test(action?.id) ? 700 : 0;
      if (!previous || !duration || motion.matches || !active) {
        applyPose(pose);
        requestFrame();
        return Promise.resolve();
      }
      return new Promise(resolve=>{
        transition={from:previous,start:performance.now(),duration,id:action.id,resolve};
        requestFrame();
      });
    },
  };
}
