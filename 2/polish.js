const $=s=>document.querySelector(s);
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced';
let lastMode='',panelContext=null;
function counters(){
  if(reduced()||!window.gsap)return;
  const value={n:0},label=$('.hero-foot>span:first-child i');
  if(label)gsap.to(value,{n:12,duration:1.25,ease:'power2.out',onUpdate:()=>label.textContent=String(Math.round(value.n)),onComplete:()=>label.textContent='12'});
}
function modeMotion(){
  const mode=document.body.dataset.mode;if(mode===lastMode)return;lastMode=mode;
  panelContext?.revert();panelContext=null;
  if(reduced()||!window.gsap)return;
  panelContext=gsap.context(()=>{
    if(mode==='home'){
      gsap.fromTo('.hero-foot>span',{opacity:0,y:12},{opacity:1,y:0,duration:.65,stagger:.12,delay:.2,clearProps:'transform,opacity'});
      gsap.fromTo('.hero-annotation',{opacity:0,x:20},{opacity:1,x:0,duration:.8,delay:.3,clearProps:'transform,opacity'});counters();
    }else if(mode==='lab'){
      gsap.fromTo('.lab-toolbar',{opacity:0,bottom:85},{opacity:1,bottom:innerWidth<700?90:112,duration:.6,ease:'power3.out',clearProps:'opacity,bottom'});
      gsap.fromTo('.lab-toolbar button',{opacity:0,y:8},{opacity:1,y:0,duration:.45,stagger:.035,delay:.15,clearProps:'opacity,transform'});
    }else gsap.fromTo('.journey-top,.journey-badge',{opacity:0},{opacity:1,duration:.65,clearProps:'opacity'});
  });
}
const panels=['#settings','#terminal','#inspector'];
for(const selector of panels){const el=$(selector);if(!el)continue;new MutationObserver(()=>{if(!el.hidden&&!reduced()&&window.gsap){gsap.killTweensOf(el);gsap.fromTo(el,{opacity:0,scale:.97},{opacity:1,scale:1,duration:.3,ease:'power2.out',clearProps:'opacity,transform'})}}).observe(el,{attributes:true,attributeFilter:['hidden']});}
new MutationObserver(modeMotion).observe(document.body,{attributes:true,attributeFilter:['data-mode']});
new MutationObserver(()=>{if(reduced()){panelContext?.revert();panelContext=null;const num=$('.hero-foot>span:first-child i');if(num)num.textContent='12';}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
window.addEventListener('load',modeMotion,{once:true});
if(document.readyState==='complete')modeMotion();
