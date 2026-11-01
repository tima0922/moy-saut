'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let observer;
  function refresh() {
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('motion-ready');
    observer ||= new IntersectionObserver(entries => entries.forEach(entry => {
      if(entry.isIntersecting){entry.target.classList.add('in-view');observer.unobserve(entry.target);}
    }), {threshold:0.07,rootMargin:'0px 0px 35px 0px'});
    document.querySelectorAll('.portal-section,.plan-stats,.portal-docbar,.page-head,.exam-hero,.exam-mode-tabs,.course-group,.item-card,.document-cover,.syllabus-content>section,.assignment-card').forEach((el,i)=>{
      if(el.hasAttribute('data-reveal'))return;
      el.dataset.reveal='';el.style.setProperty('--reveal-delay',`${Math.min(i%4,3)*65}ms`);observer.observe(el);
    });
  }
  let frame;
  document.addEventListener('pointermove',e=>{
    if(reduced.matches||e.pointerType==='touch'||frame)return;
    frame=requestAnimationFrame(()=>{frame=0;const scene=document.querySelector('.web-scene');if(!scene)return;const box=scene.getBoundingClientRect();scene.style.setProperty('--pointer-x',`${Math.max(-5,Math.min(5,(e.clientX-box.x-box.width/2)/75))}deg`);scene.style.setProperty('--pointer-y',`${Math.max(-4,Math.min(4,(box.y+box.height/2-e.clientY)/90))}deg`);});
  },{passive:true});
  reduced.addEventListener('change',()=>{observer?.disconnect();document.documentElement.classList.remove('motion-ready');document.querySelectorAll('[data-reveal]').forEach(el=>el.removeAttribute('data-reveal'));refresh();});
  window.portalMotion={refresh};refresh();
})();
