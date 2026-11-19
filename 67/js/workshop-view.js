import * as THREE from 'three';
import { GRAPHICS, renderRatio } from './graphics.js?v=033';
import { graphicsPreference } from './game-settings.js?v=037';
import { buildWorkshopModel } from './workshop-models.js';

const v = (...value)=>new THREE.Vector3(...value);
const clamp=THREE.MathUtils.clamp;
const isVisible = object => {
  for (let node=object;node;node=node.parent) if (!node.visible) return false;
  return true;
};

function diagramPainter(canvas) {
  const context=canvas.getContext('2d',{alpha:false});
  const checked = new WeakMap();
  const normal=v(), point=v(), light=v(-.4,.8,.7).normalize();
  let width=0,height=0,image,pixels,backdrop,depth;
  function meshData(mesh) {
    if (checked.has(mesh)) return checked.get(mesh);
    const {position,normal}=mesh.geometry.attributes;
    const index=mesh.geometry.index?.array;
    const data={position,normal,index,projected:new Float32Array(position.count*3)};
    checked.set(mesh,data);
    return data;
  }

  function allocate() {
    width=canvas.width;height=canvas.height;
    image=context.createImageData(width,height);
    pixels=new Uint32Array(image.data.buffer);
    backdrop=new Uint32Array(width*height);
    depth=new Float32Array(width*height);
    const xCenter=Math.floor(width/2)%22, yCenter=Math.floor(height/2)%22;
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const grid=((x-xCenter)%22===0 || (y-yCenter)%22===0) ? 8 : 0, shade=1-(y/height)*.37;
      backdrop[y*width+x]=0xff000000|((Math.round(34*shade)+grid)<<16)|((Math.round(45*shade)+grid)<<8)|(Math.round(29*shade)+grid);
    }
  }
  function raster(ax,ay,az,bx,by,bz,cx,cy,cz,color) {
    const abx=bx-ax, aby=by-ay, acx=cx-ax, acy=cy-ay;
    const area=abx*acy-aby*acx;
    if (area>=-.025) return;
    const minX=Math.max(0,Math.ceil(Math.min(ax,bx,cx))), maxX=Math.min(width-1,Math.floor(Math.max(ax,bx,cx)));
    const minY=Math.max(0,Math.ceil(Math.min(ay,by,cy))), maxY=Math.min(height-1,Math.floor(Math.max(ay,by,cy)));
    if (minX>maxX || minY>maxY) return;
    const inv=1/area, bxStep=acy*inv, cxStep=-aby*inv;
    const bzStep=bz-az, czStep=cz-az;
    for (let y=minY;y<=maxY;y++) {
      let b=((minX-ax)*acy-(y-ay)*acx)*inv, c=(abx*(y-ay)-aby*(minX-ax))*inv;
      let offset=y*width+minX;
      for (let x=minX;x<=maxX;x++,offset++,b+=bxStep,c+=cxStep) {
        if (b<0 || c<0 || b+c>1) continue;
        const z=az+b*bzStep+c*czStep;
        if (z<depth[offset]) {
          depth[offset]=z;
          pixels[offset]=color;
        }
      }
    }
  }
  const paintColors = new Map();
  function shades(hex) {
    if (!paintColors.has(hex)) {
      paintColors.set(hex,Array.from({length:9},(_,level)=>{
        const lit=(level+4)/11;
        const r=Math.round(clamp(((hex>>16)&255)*lit+10,0,255));
        const g=Math.round(clamp(((hex>>8)&255)*lit+10,0,255));
        const b=Math.round(clamp((hex&255)*lit+10,0,255));
        return 0xff000000|(b<<16)|(g<<8)|r;
      }));
    }
    return paintColors.get(hex);
  }
  return (model,camera)=>{
    if (!context || !model) return;
    if (width!==canvas.width || height!==canvas.height) allocate();
    pixels.set(backdrop);
    depth.fill(1);
    model.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    model.root.traverseVisible(mesh=>{
      if (!mesh.isMesh) return;
      const {position,normal:directions,index,projected}=meshData(mesh);
      for (let i=0;i<position.count;i++) {
        point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).project(camera);
        projected[i*3]=(point.x+1)*width*.5;
        projected[i*3+1]=(1-point.y)*height*.5;
        projected[i*3+2]=point.z;
      }
      const colors=shades(mesh.material.color.getHex());
      for (let i=0,end=index?.length ?? position.count;i<end;i+=3) {
        const a=(index ? index[i] : i)*3, b=(index ? index[i+1] : i+1)*3, c=(index ? index[i+2] : i+2)*3;
        const ax=projected[a], ay=projected[a+1], bx=projected[b], by=projected[b+1], cx=projected[c], cy=projected[c+1];
        if ((bx-ax)*(cy-ay)-(by-ay)*(cx-ax)>=-.025) continue;
        normal.fromBufferAttribute(directions,a/3).transformDirection(mesh.matrixWorld);
        const shade=Math.round(2.2+Math.max(0,normal.dot(light))*5.8);
        raster(ax,ay,projected[a+2],bx,by,projected[b+2],cx,cy,projected[c+2],colors[shade]);
      }
    });
    context.putImageData(image,0,0);
  };
}

export function createWorkshopView({host,canvas,diagram,marker,status,onPick}) {
  const profile=GRAPHICS[graphicsPreference()] ?? GRAPHICS.integrated;
  const touch=matchMedia('(pointer: coarse)');
  const camera = new THREE.PerspectiveCamera(35,1,.12,60);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17211d);
  scene.add(new THREE.HemisphereLight(0xe6f1ea,0x46554b,2.0));
  const white = new THREE.DirectionalLight(0xf4f1dc,2.6);
  white.position.set(-3,7,6);
  scene.add(white);
  const rim = new THREE.DirectionalLight(0xc7f498,1.25);
  rim.position.set(5,1,-4);
  scene.add(rim);
  const platform = new THREE.Mesh(new THREE.CircleGeometry(8,48),new THREE.MeshStandardMaterial({color:0x22312a,roughness:1}));
  platform.rotation.x=-Math.PI/2;
  const grid = new THREE.GridHelper(18,36,0x405942,0x293c33);
  scene.add(platform,grid);

  let renderer;
  const drawDiagram = diagramPainter(diagram);
  function setDisplay(available) {
    canvas.hidden = !available;
    diagram.hidden = available;
    status.textContent = available ? '3D-модель' : 'Интерактивная схема';
  }
  try {
    renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.14;
  } catch {
    setDisplay(false);
  }
  let gpu = Boolean(renderer);
  setDisplay(gpu);
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    gpu=false;
    setDisplay(false);
    resize();
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    gpu=true;
    setDisplay(true);
    resize();
  });

  const spherical = new THREE.Spherical(), target=v(0,0,0), targetGoal=v(0,0,0);
  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2();
  const nextPosition=v(), markerPoint=v(), cameraOffset=v(), focusBounds=new THREE.Sphere();
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let model,spec,selection,snapshot,step,exploded=false,isolated=false;
  let frame=0, last=0, cameraRadius=1, previousDrag;
  let width=1,height=1;
  let glow = new Map();

  function resize() {
    width=Math.round(host.clientWidth) || 1;
    height=Math.round(host.clientHeight) || 1;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    const scale=gpu ? Math.min(renderRatio(profile,width,height,devicePixelRatio,touch.matches,false),1440/Math.max(width,height))
      : Math.min(devicePixelRatio,1.5,880/Math.max(width,height));
    if (gpu) {
      renderer.setPixelRatio(scale);
      renderer.setSize(width,height,false);
    } else {
      diagram.width=Math.max(1,Math.floor(width*scale));
      diagram.height=Math.max(1,Math.floor(height*scale));
    }
    requestRender();
  }
  const observer=new ResizeObserver(resize);
  observer.observe(host);

  function requestRender() {
    if (!frame) {last=performance.now();frame=requestAnimationFrame(render);}
  }
  function render(now) {
    frame=0;
    if (!model || !snapshot || !host.clientWidth) return;
    const rate = motion.matches ? 1 : 1-Math.exp(-Math.max(1/70,Math.min(.12,(now-last)/1000))*13);
    last=now;
    let moving=false;
    for (const [id,item] of model.items) {
      const {group,part}=item;
      if (!group.visible) continue;
      nextPosition.fromArray(part.home);
      if (exploded) nextPosition.add(v(...part.explode));
      if (isolated && !snapshot.parts[id].mounted) nextPosition.set(0,0,0);
      group.position.lerp(nextPosition,rate);
      moving ||= group.position.distanceToSquared(nextPosition)>.000008;
    }
    const baseRadius=isolated
      ? Math.max(.8,model.items.get(selection).bounds.getBoundingSphere(focusBounds).radius*4.0/Math.min(1,camera.aspect))
      : spherical.radius*(exploded ? 1.34 : 1);
    const radius=baseRadius*cameraRadius;
    target.lerp(targetGoal,rate);
    moving ||= target.distanceToSquared(targetGoal)>.000008;
    cameraOffset.setFromSphericalCoords(radius,spherical.phi,spherical.theta);
    camera.position.copy(target).add(cameraOffset);
    camera.lookAt(target);
    platform.visible=grid.visible=!isolated && !exploded;
    if (gpu) renderer.render(scene,camera);
    else drawDiagram(model,camera);
    marker.hidden = !step?.ok || typeof step.index!=='number';
    if (!marker.hidden) {
      model.items.get(selection).bolts[step.index].getWorldPosition(markerPoint);
      markerPoint.project(camera);
      marker.hidden=markerPoint.z>1 || Math.abs(markerPoint.x)>.92 || Math.abs(markerPoint.y)>.92;
      marker.style.left=(markerPoint.x*.5+.5)*100+'%';
      marker.style.top=(.5-markerPoint.y*.5)*100+'%';
      marker.textContent=String(step.index+1);
    }
    if (moving) frame=requestAnimationFrame(render);
  }

  function disposeModel() {
    if (!model) return;
    model.root.removeFromParent();
    const geometry = new Set();
    model.root.traverse(object=>{if (object.isMesh) geometry.add(object.geometry);});
    for (const item of geometry) item.dispose();
    for (const material of Object.values(model.materials)) material.dispose();
    for (const material of glow.values()) material.dispose();
    glow = new Map();
  }

  function accent(material) {
    if (!glow.has(material)) {
      const bright=material.clone();
      bright.color.lerp(new THREE.Color(0xc8e395),.28);
      bright.emissive.setHex(0x253e14);
      bright.emissiveIntensity=.48;
      glow.set(material,bright);
    }
    return glow.get(material);
  }
  function showParts() {
    if (!model || !snapshot) return;
    for (const [id,item] of model.items) {
      const node=snapshot.parts[id];
      item.group.visible=isolated ? id===selection : node.mounted || exploded;
      for (const object of item.group.children) {
        if (object.userData.bolt!==undefined) continue;
        object.userData.base ??= object.material;
        object.material=id===selection ? accent(object.userData.base) : object.userData.base;
      }
      const order=item.part.order ?? item.bolts.map((_,i)=>i);
      const left=Math.min(item.bolts.length,node.fastened);
      for (const [i,bolt] of item.bolts.entries()) {
        const current=id===selection && step?.ok && step.index===i;
        bolt.visible=node.mounted && (order.indexOf(i)<left || current);
        bolt.material=current ? model.materials.activeBolt : model.materials.bolt;
      }
    }
    model.stand.visible=!isolated;
    targetGoal.set(0,exploded ? .23 : 0,0);
    if (isolated) {
      const {part,center}=model.items.get(selection);
      if (snapshot.parts[selection].mounted) {
        targetGoal.copy(center).add(v(...part.home));
        if (exploded) targetGoal.add(v(...part.explode));
      } else targetGoal.copy(center);
    }
    requestRender();
  }
  function resetCamera() {
    spherical.setFromVector3(v(...spec.camera));
    if (camera.aspect<.86) spherical.radius*=.86/camera.aspect;
    cameraRadius=1;
    requestRender();
  }

  function release(event) {
    if (!previousDrag || previousDrag.id!==event.pointerId) return;
    const moved=previousDrag.moved;
    previousDrag=null;
    if (moved || event.type!=='pointerup' || !model) return;
    const rect=event.currentTarget.getBoundingClientRect();
    mouse.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    raycaster.setFromCamera(mouse,camera);
    for (const {object} of raycaster.intersectObject(model.root,true)) {
      if (!isVisible(object)) continue;
      for (let node=object;node;node=node.parent) if (node.userData.partId) {
        onPick(node.userData.partId);
        return;
      }
    }
  }
  for (const surface of [canvas,diagram]) {
    surface.addEventListener('pointerdown',event=>{
      if (event.button>0 || previousDrag) return;
      previousDrag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener('pointermove',event=>{
      if (previousDrag?.id!==event.pointerId) return;
      const dx=event.clientX-previousDrag.x, dy=event.clientY-previousDrag.y;
      if (!previousDrag.moved && Math.abs(dx)+Math.abs(dy)<4) return;
      previousDrag.x=event.clientX;previousDrag.y=event.clientY;previousDrag.moved=true;
      spherical.theta-=dx*.0105;
      spherical.phi=clamp(spherical.phi-dy*.0105,.15,Math.PI-.24);
      requestRender();
    });
    surface.addEventListener('pointerup',release);
    surface.addEventListener('pointercancel',release);
    surface.addEventListener('wheel',event=>{
      event.preventDefault();
      zoom(event.deltaY<0 ? .90 : 1.12);
    },{passive:false});
  }
  function zoom(multiplier) {
    cameraRadius=clamp(cameraRadius*multiplier,.64,1.8);
    requestRender();
  }

  return {
    use(next) {
      disposeModel();
      spec=next;
      model=buildWorkshopModel(spec);
      scene.add(model.root);
      platform.position.y=spec.floor-.08;
      grid.position.y=spec.floor-.063;
      target.set(0,0,0);
      snapshot=undefined;
      resetCamera();
      resize();
    },
    update(state,selected,next,{explode,isolate}) {
      snapshot=state;
      selection=selected;
      step=next;
      exploded=explode;
      isolated=isolate;
      showParts();
    },
    resetCamera,zoom,
  };
}
