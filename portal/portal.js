(() => {
'use strict';
// Keep old bookmarked course sections working after the portal takes over /.
const oldRoutes = new Set(['home','plan','calendar','syllabus','tk','pk','ik','course','practice','labs','library','self','assessment','about','saved','playground','lesson','task','lab','material','selfstudy']);
if (oldRoutes.has(location.hash.slice(1).split('/')[0])) { location.replace('/web-tech/' + location.hash); return; }
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement, button = document.getElementById('motion-toggle');
let paused = reduce.matches, frame = 0, previous = 0, angle = .4;
try { paused = reduce.matches || localStorage.getItem('wong-motion') === 'paused'; } catch {}
function syncMotion() {
 root.classList.toggle('paused', paused);
 button.setAttribute('aria-pressed', String(paused));
 button.querySelector('.motion-label').textContent = paused ? 'Включить эффекты' : 'Пауза эффектов';
 button.querySelector('.motion-icon').textContent = paused ? '▷' : 'Ⅱ';
 document.querySelectorAll('.data-particles animateMotion').forEach(el => {
  const svg = el.ownerSVGElement;
  if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
 });
 cancelAnimationFrame(frame); previous = 0;
 if (ctx) { draw(); if (!paused && !document.hidden) frame = requestAnimationFrame(tick); }
}
button.addEventListener('click', () => { paused = !paused; try { localStorage.setItem('wong-motion', paused ? 'paused' : 'running'); } catch {} syncMotion(); });
reduce.addEventListener('change', e => { paused = e.matches; syncMotion(); });
const clock = document.getElementById('clock');
function updateClock(){ clock.textContent = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()); }
updateClock(); setInterval(updateClock, 30000);
document.getElementById('year').textContent = new Date().getFullYear();
if (matchMedia('(hover:hover) and (pointer:fine)').matches) document.querySelectorAll('.project').forEach(card => {
 card.addEventListener('pointermove', e => { if (paused) return; const r=card.getBoundingClientRect();card.style.setProperty('--mx',`${e.clientX-r.left}px`);card.style.setProperty('--my',`${e.clientY-r.top}px`); });
});
const canvas = document.getElementById('planet'), ctx = canvas.getContext('2d');
let width=530,height=450,dpr=1;
// A procedural globe: latitude/longitude samples rotate on a real sphere.
const shapes = [
 [[-168,67],[-145,70],[-123,55],[-108,50],[-80,54],[-53,47],[-67,26],[-82,24],[-92,17],[-106,25],[-119,35],[-135,55]],
 [[-81,12],[-62,10],[-35,-6],[-44,-25],[-65,-55],[-76,-35]],
 [[-18,35],[10,37],[32,30],[50,11],[40,-20],[18,-35],[9,-17],[-4,4],[-16,15]],
 [[-10,36],[-10,58],[25,71],[60,70],[95,77],[150,65],[178,48],[140,35],[121,20],[108,5],[91,19],[78,7],[66,26],[40,35],[30,43],[9,40]],
 [[112,-11],[132,-10],[153,-25],[145,-39],[116,-33]],
 [[-54,59],[-43,59],[-20,79],[-50,83],[-63,73]],
 [[46,-13],[50,-14],[48,-25],[44,-23]],[[130,31],[145,45],[145,33]],[[166,-34],[178,-39],[173,-47]]
];
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))yes=!yes;}return yes;}
const points=[];
for(let lat=-84;lat<=84;lat+=3){const step=3.2/Math.max(.15,Math.cos(lat*Math.PI/180));for(let lon=-180;lon<180;lon+=step){const p=lat*Math.PI/180,l=lon*Math.PI/180;points.push({x:Math.cos(p)*Math.sin(l),y:Math.sin(p),z:Math.cos(p)*Math.cos(l),land:shapes.some(s=>inside(lon,lat,s))});}}
const stars=Array.from({length:65},(_,i)=>({x:((Math.sin(i*127.1)*43758.5453)%1+1)%1,y:((Math.sin(i*311.7)*12578.9)%1+1)%1,r:i%6===0?1:.5}));
function draw(){
 if(!ctx)return;ctx.clearRect(0,0,width,height);
 const cx=width*.51,cy=height*.47,r=Math.min(width*.33,height*.39);
 for(const s of stars){ctx.fillStyle=`rgba(155,189,217,${.13+s.r*.2})`;ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fill();}
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-.25);
 ctx.strokeStyle='#83a5b426';ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(0,0,r*1.39,r*.37,-.17,0,Math.PI*2);ctx.stroke();
 let g=ctx.createRadialGradient(-r*.45,-r*.55,0,0,0,r);g.addColorStop(0,'#203844');g.addColorStop(.5,'#101e2c');g.addColorStop(1,'#080d17');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
 const ca=Math.cos(angle),sa=Math.sin(angle),tilt=.18;
 for(const p of points){let x=p.x*ca+p.z*sa,z=p.z*ca-p.x*sa,y=p.y;let yt=y*Math.cos(tilt)-z*Math.sin(tilt);let zt=z*Math.cos(tilt)+y*Math.sin(tilt);if(zt<0)continue;const light=Math.max(.13,(-x*.45+yt*.45+zt*.6));let opacity=(.12+zt*.66)*light;
 ctx.fillStyle=p.land?`rgba(183,233,149,${opacity})`:`rgba(105,157,181,${opacity*.32})`;ctx.beginPath();ctx.arc(x*r,-yt*r,p.land?1.04:.52,0,Math.PI*2);ctx.fill();}
 ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,'#c0ff9d55');g.addColorStop(.35,'#9fcbe512');g.addColorStop(.6,'#060b1400');g.addColorStop(1,'#000000c9');ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
 g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,'#bdfb9dbb');g.addColorStop(.35,'#8cb5cf55');g.addColorStop(.65,'#52799b22');g.addColorStop(1,'#283d5a33');ctx.strokeStyle=g;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
 ctx.strokeStyle='#91b6cd44';ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,0,r*1.39,r*.37,-.17,0,Math.PI);ctx.stroke();
 const orbit=angle*.65,ox=r*1.39*Math.cos(orbit),oy=r*.37*Math.sin(orbit);ctx.save();ctx.rotate(-.17);ctx.shadowBlur=12;ctx.shadowColor='#b8f66b';ctx.fillStyle='#c7ff8d';ctx.beginPath();ctx.arc(ox,oy,2.4,0,Math.PI*2);ctx.fill();ctx.restore();ctx.restore();
}
function tick(now){ if(document.hidden||paused)return;if(!previous)previous=now;const dt=Math.min(60,now-previous);if(dt>=32){angle+=dt*.00007;previous=now;draw();}frame=requestAnimationFrame(tick); }
function resize(){const box=canvas.getBoundingClientRect();width=box.width;height=box.height;dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
new ResizeObserver(resize).observe(canvas);resize();syncMotion();
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);previous=0;if(!document.hidden&&!paused)frame=requestAnimationFrame(tick);});
})();
