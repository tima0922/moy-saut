'use strict';
/* Presentation only: existing IDs, names, data attributes and listeners are retained. */
(() => {
  const $=(selector,root=document)=>root.querySelector(selector);
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const navIcons={home:'layout-dashboard',calendar:'calendar-days',syllabus:'notebook-text',course:'book-open',practice:'code-xml',library:'folder-open',tk:'clipboard-check',pk:'messages-square',ik:'graduation-cap'};
  const canIcon=()=>typeof window.lucide?.createElement==='function';
  function makeIcon(name,extra=''){
    if(!canIcon())return null;
    const key=name.split('-').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join('');
    const definition=window.lucide.icons[key];if(!definition)return null;
    const holder=document.createElement('span');holder.className='ui-icon '+extra;holder.setAttribute('aria-hidden','true');
    const svg=window.lucide.createElement(definition);
    svg.setAttribute('class','lucide lucide-'+name);svg.setAttribute('stroke-width','1.8');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    holder.appendChild(svg);return holder;
  }
  function replaceSymbol(selector,name){const el=$(selector);if(!el||el.querySelector('.ui-icon'))return;const icon=makeIcon(name);if(icon)el.replaceChildren(icon);}
  function buttonIcon(button){
    const t=button.textContent.trim().toLowerCase();
    if(button.hasAttribute('data-calendar-filter'))return 'calendar-days';
    if(button.hasAttribute('data-course-filter'))return 'layers';
    if(button.hasAttribute('data-lib-filter'))return 'folder-open';
    if(button.hasAttribute('data-exam-mode'))return button.getAttribute('data-exam-mode')==='train'?'brain-circuit':'book-open';
    if(button.hasAttribute('data-exam-page'))return button.getAttribute('data-exam-page')==='prev'?'chevron-left':'chevron-right';
    if(button.hasAttribute('data-template'))return 'code-xml';
    if(button.hasAttribute('download')||/^(sources|texts|handouts)\//.test(button.getAttribute('href')||'')||/скачать|выгрузить/.test(t))return 'download';
    if(button.hasAttribute('data-print'))return 'printer';
    if(button.hasAttribute('data-search-open'))return 'search';
    if(button.hasAttribute('data-copy'))return 'copy';
    if(button.hasAttribute('data-train-start'))return 'play';
    if(button.hasAttribute('data-train-check'))return 'circle-check';
    if(button.hasAttribute('data-train-next'))return 'arrow-right';
    if(button.hasAttribute('data-train-retry')||button.hasAttribute('data-train-reset'))return 'rotate-ccw';
    if(button.hasAttribute('data-exam-reveal'))return 'eye';
    if(button.hasAttribute('data-run'))return 'play';
    if(/читать|лекци/.test(t))return 'book-open';
    if(/сброс|заново|новая/.test(t))return 'rotate-ccw';
    if(/сохран|избран/.test(t))return 'bookmark';
    if(/вопрос|тест/.test(t))return 'circle-help';
    if(/тема|материал/.test(t))return 'layers';
    return 'arrow-up-right';
  }
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  let pointerFrame;
  document.addEventListener('pointermove',event=>{if(motionPreference.matches||event.pointerType==='touch'||pointerFrame)return;pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;const ambient=$('.ambient');ambient?.style.setProperty('--cursor-x',event.clientX+'px');ambient?.style.setProperty('--cursor-y',event.clientY+'px');});},{passive:true});
  let scheduled=false;
  function enhance(){
    scheduled=false;
    if(!$('#openSearch').hasAttribute('aria-label'))$('#openSearch').setAttribute('aria-label','Найти материал');
    all('.button').forEach(el=>{el.classList.add('btn','transition-all','duration-300','hover:shadow-lg','active:scale-[0.98]');el.classList.toggle('btn-outline',el.classList.contains('secondary'));el.classList.toggle('btn-ghost',el.classList.contains('ghost'));});
    all('.item-card,.portal-shortcut,.assignment-card,.srs-card,.exam-question,.training-question,.training-setup,.training-result,.document-cover').forEach(el=>el.classList.add('card','backdrop-blur-xl','transition-all','duration-300'));
    all('.tag').forEach(el=>el.classList.add('badge'));
    all('.input-wrap').forEach(el=>el.classList.add('input'));
    all('select').forEach(el=>el.classList.add('select'));
    all('.checks input[type="checkbox"]').forEach(el=>el.classList.add('checkbox'));
    if(!canIcon())return;
    all('#nav a').forEach(el=>{const target=$('.nav-number',el);if(target&&!target.querySelector('.ui-icon')){const icon=makeIcon(navIcons[el.getAttribute('href').slice(1)]||'file-text');if(icon)target.appendChild(icon);}});
    all('.portal-shortcut').forEach(el=>{const target=$('.shortcut-icon',el);if(target&&!target.querySelector('.ui-icon')){const name=navIcons[el.getAttribute('href').slice(1)]||'folder-open';const icon=makeIcon(name);if(icon)target.replaceChildren(icon);}});
    all('.button,button:not(.icon-button):not(.search-trigger)').forEach(el=>{if(el.querySelector('.ui-leading-icon')||el.querySelector('svg'))return;const name=buttonIcon(el);const icon=name&&makeIcon(name,'ui-leading-icon');if(icon)el.prepend(icon);});
    all('a.icon-button[download]').forEach(el=>{if(el.querySelector('svg'))return;const icon=makeIcon('download');if(icon)el.replaceChildren(icon);});
    all('.plan-stats>div').forEach((el,i)=>{if(el.querySelector('.stat-icon'))return;const icon=makeIcon(['book-open','code-xml','lightbulb','clock-3'][i],'stat-icon');if(icon)el.prepend(icon);});
    replaceSymbol('#menuToggle','menu');replaceSymbol('#closeSearch','x');replaceSymbol('#openSearch>span:first-child','search');replaceSymbol('.search-top>span','search');
    const theme=$('#themeToggle');
    document.documentElement.setAttribute('data-theme',document.body.classList.contains('light')?'light':'night');const themeName=document.body.classList.contains('light')?'moon':'sun';
    if(theme&&!theme.querySelector('.lucide-'+themeName)){const icon=makeIcon(themeName);if(icon)theme.replaceChildren(icon);}
    all('.input-wrap>span:first-child').forEach(el=>{if(!el.querySelector('.ui-icon')){const icon=makeIcon('search');if(icon)el.replaceChildren(icon);}});
    all('.page-head h1,.section-head h2,.reader-section h2,.syllabus-content h2,.assignment-card h3,.control-cards h3,.training-question h2,.training-setup h2').forEach(el=>{if(el.querySelector('.title-icon'))return;const path=$('#nav a.active')?.getAttribute('href')?.slice(1);const name=navIcons[path]||'sparkles';const icon=makeIcon(name,'title-icon');if(icon)el.prepend(icon);});
    all('.tag,.training-progress>span:first-child').forEach(el=>{if(el.querySelector('.ui-icon'))return;const icon=makeIcon(el.classList.contains('tag')?'hash':'timer','status-icon');if(icon)el.prepend(icon);});
    all('.semester-pill>span').forEach(el=>{if(!el.querySelector('.ui-icon')){const icon=makeIcon('bookmark');if(icon)el.replaceChildren(icon);}});
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  const observer=new MutationObserver(schedule);
  observer.observe(document.querySelector('.app-shell'),{childList:true,subtree:true});
  observer.observe(document.querySelector('#nav'),{childList:true,subtree:true});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  window.portalUI={
    refresh:schedule,
    notify(message){
      if(typeof window.Swal?.fire!=='function')return false;
      const info=/не разрешил|выделен|ctrl\+c|недоступ/i.test(message);
      window.Swal.fire({toast:true,position:'bottom-start',titleText:String(message),icon:info?'info':'success',showConfirmButton:false,showCloseButton:true,closeButtonAriaLabel:'Закрыть уведомление',timer:3600,timerProgressBar:true,returnFocus:false,heightAuto:false,customClass:{popup:'portal-toast',title:'portal-toast-title',timerProgressBar:'portal-toast-progress'},showClass:{popup:reduced.matches?'':'portal-toast-enter'},hideClass:{popup:reduced.matches?'':'portal-toast-leave'},didOpen(popup){popup.addEventListener('mouseenter',window.Swal.stopTimer);popup.addEventListener('mouseleave',window.Swal.resumeTimer);}});
      return true;
    }
  };
  try{if(!localStorage.getItem('tift-night-interface-v1')){if(document.body.classList.contains('light'))$('#themeToggle').click();localStorage.setItem('tift-night-interface-v1','1');}}catch{}
  enhance();
})();
