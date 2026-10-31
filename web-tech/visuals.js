'use strict';
/* Decorative WebGL and motion only. The portal's event bindings stay in app.js. */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(pointer:fine) and (hover:hover)');
  const smallScreen=matchMedia('(max-width:650px)');
  const main=document.querySelector('#main');
  let network=null,hero=null,routeContext=null,tilted=[];
  let webglSupport;
  function supportsWebGL(){if(webglSupport!==undefined)return webglSupport;try{const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');webglSupport=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{webglSupport=false;}return webglSupport;}
  function makeNetwork(){
    if(network||reduced.matches||!window.VANTA?.NET||!window.THREE)return;
    const host=document.querySelector('.universe-background');
    if(!supportsWebGL()){network=makeCanvasNetwork(host);return;}
    try{
      network=window.VANTA.NET({el:host,THREE:window.THREE,mouseControls:true,touchControls:false,gyroControls:false,minHeight:200,minWidth:200,scale:1.25,scaleMobile:2,color:0x527fa5,backgroundColor:0x080d1d,backgroundAlpha:0,points:smallScreen.matches?7:10,maxDistance:smallScreen.matches?19:23,spacing:18,showDots:true});
      host.classList.add('is-live');
    }catch{host.classList.remove('is-live');}
  }
  function syncNetworkTheme(){if(!network||typeof network.setOptions!=='function')return;const light=document.body.classList.contains('light');network.setOptions({color:light?0x849aca:0x527fa5,backgroundAlpha:0});}
  function disposeHero(){if(!hero)return;hero.dispose();hero=null;}
  function makeHero(){
    const host=main.querySelector('.web-scene');
    if(hero?.host===host)return;
    disposeHero();if(!host||!window.THREE)return;
    const T=window.THREE;
    if(!supportsWebGL()){hero=makeCanvasHero(host,T);return;}
    let renderer;
    try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch{return;}
    const canvas=renderer.domElement;canvas.className='hero-webgl';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
    renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,smallScreen.matches?1.4:2));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
    const scene=new T.Scene();const camera=new T.PerspectiveCamera(38,1,.1,100);camera.position.set(0,.1,6.4);
    const system=new T.Group();scene.add(system);
    const knotGeo=new T.TorusKnotGeometry(.78,.225,180,28,2,3);
    const knotMat=new T.MeshPhysicalMaterial({color:0x91a3ff,metalness:.72,roughness:.17,clearcoat:1,clearcoatRoughness:.08});
    const knot=new T.Mesh(knotGeo,knotMat);system.add(knot);
    const wireGeo=new T.IcosahedronGeometry(1.55,1);
    const wireMat=new T.MeshBasicMaterial({color:0x81dfcf,wireframe:true,transparent:true,opacity:.18,depthWrite:false});
    const wire=new T.Mesh(wireGeo,wireMat);system.add(wire);
    const ringGeo=new T.TorusGeometry(1.62,.009,8,150);
    const ringMats=[0x9eb9ff,0x7ee9cf,0xc6a5ff].map(color=>new T.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false}));
    const rings=ringMats.map((material,i)=>{const mesh=new T.Mesh(ringGeo,material);mesh.rotation.set(.35+i*.8,i*.7,.2+i*.35);system.add(mesh);return mesh;});
    const dotGeo=new T.SphereGeometry(.045,12,10),dotMat=new T.MeshBasicMaterial({color:0x9ef3db});
    const dots=Array.from({length:9},(_,i)=>{const dot=new T.Mesh(dotGeo,dotMat);const angle=i/9*Math.PI*2;dot.position.set(Math.cos(angle)*1.62,Math.sin(angle)*1.62,0);rings[i%3].add(dot);return dot;});
    const particleGeo=new T.BufferGeometry();const positions=new Float32Array(420);for(let i=0;i<positions.length;i+=3){positions[i]=(Math.random()-.5)*4.5;positions[i+1]=(Math.random()-.5)*4.5;positions[i+2]=(Math.random()-.5)*3.5;}
    particleGeo.setAttribute('position',new T.BufferAttribute(positions,3));
    const particleMat=new T.PointsMaterial({color:0xb0bfff,size:.023,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending});
    const particles=new T.Points(particleGeo,particleMat);scene.add(particles);
    scene.add(new T.AmbientLight(0xa4b8ef,.9));
    const light1=new T.PointLight(0xb9acff,3.5,25);light1.position.set(3,3,5);scene.add(light1);
    const light2=new T.PointLight(0x6fffd7,3.8,25);light2.position.set(-3,1,2);scene.add(light2);
    const light3=new T.PointLight(0x697cff,4,25);light3.position.set(1,-3,3);scene.add(light3);
    const white=new T.DirectionalLight(0xffffff,1.5);white.position.set(-2,4,5);scene.add(white);
    let frame=0,live=true,visible=true,px=0,py=0,turnX=0,turnY=0,start=performance.now();
    function resize(){if(!live)return;const width=host.clientWidth,height=host.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();}
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
    function move(event){if(!finePointer.matches||reduced.matches)return;const box=host.getBoundingClientRect();px=Math.max(-1,Math.min(1,(event.clientX-box.left-box.width/2)/(box.width/2)));py=Math.max(-1,Math.min(1,(event.clientY-box.top-box.height/2)/(box.height/2)));}
    document.addEventListener('pointermove',move,{passive:true});
    function render(now){
      frame=0;if(!live||!host.isConnected)return;
      const t=(now-start)/1000;turnX+=(py*.18-turnX)*.04;turnY+=(px*.25-turnY)*.04;
      system.rotation.x=.2+turnX;system.rotation.y=turnY;
      if(!reduced.matches){knot.rotation.x=t*.17;knot.rotation.y=t*.24;wire.rotation.y=-t*.075;wire.rotation.z=t*.045;system.position.y=Math.sin(t*.7)*.12;rings.forEach((ring,i)=>{ring.rotation.z=t*(.055+i*.025)+i*.5;});particles.rotation.y=-t*.025;}
      renderer.render(scene,camera);
      if(!reduced.matches&&visible&&!document.hidden)frame=requestAnimationFrame(render);
    }
    const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&!frame)frame=requestAnimationFrame(render);else if(!visible&&frame){cancelAnimationFrame(frame);frame=0;}},{rootMargin:'120px'});visibilityObserver.observe(host);
    function visibility(){if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else if(!document.hidden&&visible&&!frame)frame=requestAnimationFrame(render);}
    document.addEventListener('visibilitychange',visibility);
    canvas.addEventListener('webglcontextlost',()=>{host.classList.remove('has-webgl');disposeHero();});
    host.classList.add('has-webgl');frame=requestAnimationFrame(render);
    hero={host,dispose(){live=false;cancelAnimationFrame(frame);resizeObserver.disconnect();visibilityObserver.disconnect();document.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',visibility);[knotGeo,wireGeo,ringGeo,dotGeo,particleGeo].forEach(x=>x.dispose());[knotMat,wireMat,dotMat,particleMat,...ringMats].forEach(x=>x.dispose());renderer.dispose();canvas.remove();host.classList.remove('has-webgl');}};
  }
  function makeCanvasNetwork(host){
    const canvas=document.createElement('canvas');canvas.className='network-canvas-fallback';host.appendChild(canvas);
    const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return null;}
    let w=0,h=0,frame=0,last=0,mx=0,my=0;const points=Array.from({length:90},(_,i)=>({x:(i%12)/11,y:Math.floor(i/12)/7,z:Math.sin(i*13.4)}));
    function resize(){w=innerWidth;h=innerHeight;const ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=w*ratio;canvas.height=h*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);}
    function pointer(e){mx=(e.clientX/w-.5)*35;my=(e.clientY/h-.5)*25;}
    function draw(now){frame=requestAnimationFrame(draw);if(now-last<33||document.hidden)return;last=now;ctx.clearRect(0,0,w,h);const light=document.body.classList.contains('light');const rendered=points.map((p,i)=>({x:p.x*(w+130)-65+Math.sin(now*.00012+i)*18+mx*p.z,y:p.y*(h+100)-50+Math.cos(now*.00015+i)*20+my*p.z}));ctx.lineWidth=.65;for(let i=0;i<rendered.length;i++){const a=rendered[i];for(const j of [i+1,i+12,i+13]){const b=rendered[j];if(!b||Math.abs(a.x-b.x)>w*.2)continue;ctx.strokeStyle=light?'rgba(76,108,160,.22)':'rgba(106,164,185,.22)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.fillStyle=light?'rgba(80,114,175,.4)':'rgba(131,195,211,.5)';ctx.beginPath();ctx.arc(a.x,a.y,1.5,0,Math.PI*2);ctx.fill();}}
    resize();addEventListener('resize',resize);document.addEventListener('pointermove',pointer,{passive:true});frame=requestAnimationFrame(draw);host.classList.add('is-live');
    return{destroy(){cancelAnimationFrame(frame);removeEventListener('resize',resize);document.removeEventListener('pointermove',pointer);canvas.remove();host.classList.remove('is-live');}};
  }
  function makeCanvasHero(host,T){
    const canvas=document.createElement('canvas');canvas.className='hero-webgl hero-canvas-projection';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
    const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return null;}
    const geometry=new T.TorusKnotGeometry(.78,.225,smallScreen.matches?84:120,smallScreen.matches?12:16,2,3);
    const raw=geometry.attributes.position.array;const indices=geometry.index.array;const transformed=new Float32Array(raw.length);let w=0,h=0,ratio=1,frame=0,last=0,live=true,px=0,py=0;
    function resize(){w=host.clientWidth;h=host.clientHeight;ratio=Math.min(devicePixelRatio||1,1.7);canvas.width=w*ratio;canvas.height=h*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);}
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
    function pointer(e){const box=host.getBoundingClientRect();px=Math.max(-1,Math.min(1,(e.clientX-box.left-box.width/2)/(box.width/2)));py=Math.max(-1,Math.min(1,(e.clientY-box.top-box.height/2)/(box.height/2)));}
    document.addEventListener('pointermove',pointer,{passive:true});
    function project(x,y,z,ax,ay){const cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay);const yy=y*cx-z*sx,zz=y*sx+z*cx;const xx=x*cy+zz*sy,depth=-x*sy+zz*cy;const scale=Math.min(w,h)*.285*4/(4-depth);return{x:w/2+xx*scale,y:h/2+yy*scale,z:depth,xx,yy};}
    function ring(t,phase,color){ctx.beginPath();for(let i=0;i<=100;i++){const angle=i/100*Math.PI*2;const p=project(Math.cos(angle)*1.55,Math.sin(angle)*1.55,0,.5+phase,.5+t*.08+phase);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.stroke();const dot=project(Math.cos(t*.25+phase)*1.55,Math.sin(t*.25+phase)*1.55,0,.5+phase,.5+t*.08+phase);ctx.fillStyle='#a8eddc';ctx.shadowBlur=12;ctx.shadowColor='#7aeed0';ctx.beginPath();ctx.arc(dot.x,dot.y,2.8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    function draw(now){
      frame=0;if(!live||!host.isConnected)return;if(!reduced.matches)frame=requestAnimationFrame(draw);if(now-last<33||document.hidden)return;last=now;const box=host.getBoundingClientRect();if(box.bottom<0||box.top>innerHeight)return;
      const t=reduced.matches?1.6:now*.00035,ax=.5+t*.3+py*.13,ay=t*.5+px*.23;
      ctx.clearRect(0,0,w,h);const glow=ctx.createRadialGradient(w*.5,h*.5,5,w*.5,h*.5,Math.min(w,h)*.46);glow.addColorStop(0,'rgba(107,145,241,.12)');glow.addColorStop(.65,'rgba(102,202,195,.05)');glow.addColorStop(1,'rgba(111,146,246,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
      ring(t,0,'rgba(156,180,255,.4)');ring(t,1.05,'rgba(124,229,207,.35)');ring(t,2.15,'rgba(201,164,255,.32)');
      for(let i=0;i<raw.length;i+=3){const p=project(raw[i],raw[i+1],raw[i+2],ax,ay);transformed[i]=p.x;transformed[i+1]=p.y;transformed[i+2]=p.z;}
      const faces=[];for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;const cross=(transformed[b]-transformed[a])*(transformed[c+1]-transformed[a+1])-(transformed[b+1]-transformed[a+1])*(transformed[c]-transformed[a]);if(cross>=0)continue;faces.push({a,b,c,z:(transformed[a+2]+transformed[b+2]+transformed[c+2])/3});}faces.sort((a,b)=>a.z-b.z);
      for(const f of faces){const {a,b,c,z}=f;const ux=transformed[b]-transformed[a],uy=transformed[b+1]-transformed[a+1],uz=(transformed[b+2]-transformed[a+2])*80,vx=transformed[c]-transformed[a],vy=transformed[c+1]-transformed[a+1],vz=(transformed[c+2]-transformed[a+2])*80;const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const length=Math.hypot(nx,ny,nz)||1;const light=Math.max(.12,Math.min(1,.5+(-nx*.4-ny*.5-nz*.7)/length*.6));const hue=205+(nx/length+1)*24;ctx.fillStyle=`hsl(${hue},${52+light*24}%,${23+light*48}%)`;ctx.beginPath();ctx.moveTo(transformed[a],transformed[a+1]);ctx.lineTo(transformed[b],transformed[b+1]);ctx.lineTo(transformed[c],transformed[c+1]);ctx.closePath();ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.55;ctx.stroke();}
      for(let i=0;i<20;i++){const a=i*2.399+t*.08;const radius=Math.min(w,h)*(.33+(i%4)*.03);const x=w/2+Math.cos(a)*radius,y=h/2+Math.sin(a)*radius*.85;ctx.fillStyle=i%3?'rgba(169,197,255,.55)':'rgba(155,240,214,.75)';ctx.beginPath();ctx.arc(x,y,i%3?.8:1.4,0,Math.PI*2);ctx.fill();}
    }
    host.classList.add('has-webgl');frame=requestAnimationFrame(draw);
    return{host,dispose(){live=false;cancelAnimationFrame(frame);resizeObserver.disconnect();document.removeEventListener('pointermove',pointer);geometry.dispose();canvas.remove();host.classList.remove('has-webgl');}};
  }
  function clearTilts(){tilted.forEach(el=>el.vanillaTilt?.destroy());tilted=[];}
  function initTilts(){
    clearTilts();if(reduced.matches||!finePointer.matches||!window.VanillaTilt)return;
    tilted=[...main.querySelectorAll('.portal-shortcut,.item-card,.control-cards article')];
    window.VanillaTilt.init(tilted,{max:5,speed:650,perspective:1200,scale:1.015,glare:true,'max-glare':.13,gyroscope:false});
  }
  function animateRoute(){
    routeContext?.revert();routeContext=null;
    if(reduced.matches||!window.gsap)return;
    const g=window.gsap;if(window.ScrollTrigger)g.registerPlugin(window.ScrollTrigger);
    routeContext=g.context(()=>{
      g.fromTo(main,{opacity:.3,rotationY:-3,rotationX:1.4,transformPerspective:1500,x:-15},{opacity:1,rotationY:0,rotationX:0,x:0,duration:.8,ease:'power3.out',clearProps:'transform,opacity'});
      if(main.querySelector('.hero-copy'))g.fromTo('.hero-copy > *',{y:26,opacity:0},{y:0,opacity:1,duration:.8,stagger:.085,ease:'power3.out',delay:.15,clearProps:'transform,opacity'});
      if(window.ScrollTrigger){
        main.querySelectorAll('.portal-shortcuts,.card-grid,.control-cards').forEach(grid=>g.fromTo([...grid.children],{y:35,rotationX:6,opacity:.15,transformPerspective:1000},{y:0,rotationX:0,opacity:1,duration:.9,stagger:.09,ease:'power3.out',clearProps:'transform,opacity',scrollTrigger:{trigger:grid,start:'top 92%',once:true}}));
        main.querySelectorAll('.reader-section').forEach(el=>g.fromTo(el,{y:24,opacity:.35},{y:0,opacity:1,duration:.8,ease:'power2.out',clearProps:'transform,opacity',scrollTrigger:{trigger:el,start:'top 94%',once:true}}));
      }
    },main);
  }
  function routeVisuals(){makeHero();initTilts();animateRoute();}
  window.addEventListener('hashchange',()=>requestAnimationFrame(routeVisuals));
  const themeObserver=new MutationObserver(syncNetworkTheme);themeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  reduced.addEventListener('change',()=>{network?.destroy();network=null;routeContext?.revert();clearTilts();disposeHero();if(!reduced.matches)makeNetwork();routeVisuals();});
  smallScreen.addEventListener('change',()=>{network?.destroy();network=null;makeNetwork();initTilts();});
  finePointer.addEventListener('change',initTilts);
  window.addEventListener('pagehide',()=>{network?.destroy();network=null;disposeHero();clearTilts();routeContext?.revert();});
  makeNetwork();syncNetworkTheme();routeVisuals();
})();
