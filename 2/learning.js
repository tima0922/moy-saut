const STORAGE = 'packet-progress';
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function initLearning({toast = () => {}, onPractice = () => {}, onHome = () => {}} = {}) {
  const contentPromise = import('./content.js');
  let lessons = [], osi = [], tab = 'course', previousFocus = null, lessonIndex = null, quizIndex = 0, quizScore = 0, quizAnswered = false, quizStarted = false, quizAnswers = [], toolTab = 'subnet', dnsStep = 0;
  const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion !== 'reduced';
  function readProgress() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      return {done: [...new Set((Array.isArray(raw.done) ? raw.done : []).filter(n => Number.isInteger(n) && n >= 0 && n < 12))], best: Math.max(0, Math.min(12, Number(raw.best) || 0))};
    } catch { return {done: [], best: 0}; }
  }
  let progress = readProgress();
  const dialog = document.createElement('dialog');
  dialog.className = 'learn-shell'; dialog.id = 'learningOverlay'; dialog.setAttribute('aria-label', 'Академия компьютерных сетей');
  dialog.innerHTML = `<header class="learn-header"><button class="learn-wordmark" data-action="home" aria-label="PACKET — на главную" title="На главный 3D-экран"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 9h17l10 14H12zM2 23h17L29 9H12z"/></svg><b>PACKET</b><span>ACADEMY / 02</span></button><nav aria-label="Разделы академии"><button data-tab="course"><small>01</small> Курс</button><button data-tab="tools"><small>02</small> Эксперименты</button><button data-tab="quiz"><small>03</small> Проверка знаний</button></nav><div class="learn-progress"><span class="learn-progress-num">00</span><span>/ 12<br>ПРОЙДЕНО</span><span class="learn-progress-track"><i></i></span></div><button class="learn-home-link" data-action="home" title="Вернуться на главный экран">↖ На главную</button><button class="learn-close" data-action="close" aria-label="Закрыть академию и вернуться в 3D-мир">×</button></header><div class="learn-scroll"><div class="learn-content"></div><footer class="learn-footer"><span>ЗНАНИЕ ПОЯВЛЯЕТСЯ В ДЕЙСТВИИ.</span><button data-action="practice">Вернуться в 3D-мир <span>↗</span></button></footer></div>`;
  document.body.append(dialog);
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./learning.css', import.meta.url).href; document.head.append(stylesheet);
  const $ = s => dialog.querySelector(s), $$ = s => [...dialog.querySelectorAll(s)];
  const pane = $('.learn-content'), scroll = $('.learn-scroll');
  const number = n => String(n).padStart(2, '0');
  let motionEpoch = 0, motionContext = null, revealObserver = null, headingSplits = [];
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  function stopMotion() {
    motionEpoch++;
    revealObserver?.disconnect(); revealObserver = null;
    motionContext?.revert(); motionContext = null;
    for (const split of headingSplits.splice(0).reverse()) split.revert();
    dialog.classList.remove('learn-motion-live');
  }
  // The artwork uses real nested orbit transforms, moving signals and scan lines.
  // It is decorative; all meaningful text remains ordinary accessible HTML.
  function orbitArtwork(kind = 'course') {
    return `<div class="learn-orbit learn-orbit--${kind}" aria-hidden="true"><div class="learn-orbit-halo"></div><div class="learn-orbit-grid"></div><svg class="learn-orbit-links" viewBox="0 0 400 400"><path d="M68 123 200 200 324 90M200 200 335 282M200 200 89 312M68 123 324 90 335 282 89 312Z"/><path class="learn-electric-flow" d="M68 123 200 200 335 282 324 90 200 200 89 312"/><g><circle cx="68" cy="123" r="5"/><circle cx="324" cy="90" r="4"/><circle cx="335" cy="282" r="6"/><circle cx="89" cy="312" r="4"/></g></svg><div class="learn-orbit-plane plane-one"><div class="learn-orbit-ring"><i></i><i></i></div></div><div class="learn-orbit-plane plane-two"><div class="learn-orbit-ring"><i></i><i></i></div></div><div class="learn-orbit-plane plane-three"><div class="learn-orbit-ring"><i></i></div></div><div class="learn-orbit-sweep"></div><div class="learn-orbit-core"><div class="learn-orbit-core-dot"></div><b>${kind === 'quiz' ? '?' : kind === 'tools' ? '↗' : '12'}</b><small>${kind === 'quiz' ? 'SIGNAL CHECK' : kind === 'tools' ? 'EXPERIMENT' : 'CONNECTED IDEAS'}</small></div><div class="learn-orbit-readout readout-one">TCP / IP <i>●</i></div><div class="learn-orbit-readout readout-two">${kind === 'quiz' ? 'ПРОВЕРЬ СВЯЗЬ' : 'СЛЕДУЙ ЗА ИДЕЕЙ'}<br><b>01 → ∞</b></div></div>`;
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE, JSON.stringify(progress)); }
    catch { toast('Браузер не разрешил сохранить прогресс. Обучение можно продолжить.'); }
    updateProgress();
    window.dispatchEvent(new CustomEvent('packet-progress', {detail: getProgress()}));
  }
  function getProgress() { return {done: [...progress.done], completed: progress.done.length, total: 12, best: progress.best}; }
  function updateProgress() { dialog.style.setProperty('--learn-progress',(progress.done.length/12*100)+'%'); $('.learn-progress-num').textContent = number(progress.done.length); }
  function animate(scope = pane) {
    stopMotion();
    if (!motionOK()) return;
    dialog.classList.add('learn-motion-live');
    if (!window.gsap) return;
    const epoch = motionEpoch;
    motionContext = window.gsap.context(() => {}, pane);
    const isCurrent = () => epoch === motionEpoch && dialog.open && scope.isConnected && pane.contains(scope) && motionOK();
    // Fonts must be settled before splitting; page changes invalidate this continuation.
    document.fonts.ready.then(() => {
      if (!isCurrent()) return;
      const headingSelector = 'h1,.learn-tool-explain h2,.learn-prose h2,.learn-check h2,.learn-dns-copy h3,.learn-osi-description h3';
      const headings = [...scope.querySelectorAll(headingSelector)];
      const reveals = [...scope.querySelectorAll('[data-reveal]')].filter(el => !el.querySelector('h1,h2') && !el.matches('.learn-prose,.learn-reader-aside'));
      const seen = new WeakSet();
      function reveal(el) {
        if (!isCurrent() || seen.has(el)) return; seen.add(el);
        motionContext.add(() => {
          if (el.matches(headingSelector) && window.SplitText) {
            const split = window.SplitText.create(el, {type: 'words,chars', tag: 'span', wordsClass: 'learn-split-word', charsClass: 'learn-split-char', aria: 'auto', smartWrap: true});
            headingSplits.push(split);
            window.gsap.fromTo(split.chars, {opacity: 0, yPercent: 60, rotationX: -48, filter: 'blur(5px)'}, {opacity: 1, yPercent: 0, rotationX: 0, filter: 'blur(0px)', duration: .78, stagger: Math.min(.023, .8 / Math.max(1, split.chars.length)), ease: 'power3.out', clearProps: 'transform,opacity,filter'});
          } else window.gsap.fromTo(el, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: .65, ease: 'power3.out', clearProps: 'transform,opacity'});
        });
      }
      const targets = [...headings, ...reveals];
      if ('IntersectionObserver' in window) {
        revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {if (entry.isIntersecting) {reveal(entry.target); revealObserver?.unobserve(entry.target);}}), {root: scroll, threshold: .12});
        targets.forEach(el => revealObserver.observe(el));
      } else targets.forEach(reveal);
    });
  }
  function changePage(next) {
    tab = ['course', 'tools', 'quiz'].includes(next) ? next : 'course'; lessonIndex = null;
    $$('.learn-header [data-tab]').forEach(b => { b.classList.toggle('is-active', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
    if (tab === 'course') renderCourse();
    else if (tab === 'tools') renderTools();
    else renderQuiz();
    scroll.scrollTop = 0; animate();
  }
  async function open(next = 'course') {
    previousFocus = document.activeElement;
    ({lessons, osi} = await contentPromise);
    progress = readProgress(); updateProgress(); changePage(next);
    if (!dialog.open) dialog.showModal();
    $('.learn-close').focus({preventScroll: true});
    animate();
  }
  async function openLesson(index = 0) {
    await open('course');
    const target = Number(index);
    showLesson(Number.isInteger(target) ? Math.max(0, Math.min(lessons.length - 1, target)) : 0);
  }
  function close() { stopMotion(); dialog.close(); previousFocus?.focus?.({preventScroll: true}); }
  function practice(index = lessonIndex) { close(); onPractice(index); }
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('close', stopMotion);
  const refreshMotion = () => { if (dialog.open) animate(); };
  motionQuery.addEventListener('change', refreshMotion);
  new MutationObserver(refreshMotion).observe(document.documentElement, {attributes: true, attributeFilter: ['data-motion']});
  dialog.addEventListener('click', e => {
    const target = e.target.closest('[data-tab],[data-action]'); if (!target) return;
    if (target.dataset.tab) changePage(target.dataset.tab);
    else if (target.dataset.action === 'close') close();
    else if (target.dataset.action === 'practice') practice();
    else if (target.dataset.action === 'home') { close(); onHome(); }
  });
  function renderCourse() {
    pane.innerHTML = `<section class="learn-hero" data-reveal><div class="learn-kicker"><i></i> МАРШРУТ ОБУЧЕНИЯ / С НУЛЯ</div><h1>Пойми то,<br>что <em>невидимо.</em></h1><div class="learn-hero-bottom"><p>Интернет перестаёт быть магией,<br>когда ты знаешь, что происходит внутри.</p><span class="learn-mono">12 ГЛАВ · ТЕОРИЯ + ПРАКТИКА<br>В ТВОЁМ ТЕМПЕ · БЕЗ АККАУНТОВ</span></div>${orbitArtwork()}</section><div class="learn-course-toolbar" data-reveal><span class="learn-kicker">ТВОЙ СЛЕДУЮЩИЙ ШАГ</span><label class="learn-search"><span>⌕</span><input type="search" placeholder="Найти DNS, IP, Wi-Fi…" aria-label="Поиск по урокам"></label></div><div class="learn-chapters"></div><div class="learn-course-note" data-reveal><span>✦</span><p>Твоя задача — понять, а не запомнить формулировку. После каждой главы проверь себя и попробуй идею в лаборатории.</p><button class="learn-link" data-action="practice">Проверить на практике ↗</button></div>`;
    const list = $('.learn-chapters');
    function fill() {
      const query = $('.learn-search input').value.trim().toLocaleLowerCase('ru'); list.innerHTML = '';
      lessons.forEach((l, i) => {
        if (!(l.title + ' ' + l.desc + ' ' + l.tag).toLocaleLowerCase('ru').includes(query)) return;
        const row = document.createElement('button'); row.className = 'learn-chapter'; row.dataset.reveal = ''; row.setAttribute('aria-label', `${i + 1}. ${l.title}${progress.done.includes(i) ? ', пройдено' : ''}`);
        row.innerHTML = `<span class="learn-chapter-no">${number(i + 1)}</span><span class="learn-chapter-main"><span class="learn-kicker">${l.tag}</span><h2>${l.title}</h2><p>${l.desc}</p></span><span class="learn-chapter-time">${l.time} МИН</span><span class="learn-chapter-arrow ${progress.done.includes(i) ? 'is-complete' : ''}">${progress.done.includes(i) ? '✓' : '↗'}</span>`;
        row.onclick = () => showLesson(i); list.append(row);
      });
      if (!list.children.length) list.innerHTML = '<p class="learn-empty">Этой темы пока нет. Попробуй «сеть», «DNS» или «TCP».</p>';
    }
    $('.learn-search input').addEventListener('input', fill); fill();
  }
  function showLesson(index) {
    lessonIndex = index; const l = lessons[index];
    // Keep instructions consistent with the rebuilt editor, which selects individual cables.
    const updated = text => text.replaceAll('нажми «Разрыв связи»', 'выбери кабель и отключи его').replaceAll('Нажми «Разрыв связи»', 'Выбери кабель и отключи его').replaceAll('Наша анимация отправляет один условный ICMP Echo-пакет', 'Учебная отправка пакета иллюстрирует прохождение сообщения');
    pane.innerHTML = `<div class="learn-reader-top" data-reveal><button class="learn-link" id="learn-back">← Все главы</button><span class="learn-kicker">ГЛАВА ${number(index + 1)} / 12 · ${l.time} МИН</span></div><article class="learn-reader"><aside class="learn-reader-aside" data-reveal><span class="learn-giant-number">${number(index + 1)}</span><div class="learn-kicker">${l.tag}</div><div class="learn-toc">${l.sections.map(([title], i) => `<a href="#learn-section-${i}">${number(i + 1)}<span>${title}</span></a>`).join('')}</div><button class="learn-practice-btn" data-action="practice">Исследовать в 3D <span>↗</span></button></aside><div class="learn-reader-body"><header data-reveal><h1>${l.title}</h1><p class="learn-lead">${l.desc}</p></header><blockquote data-reveal><span>ПРЕДСТАВЬ</span>${l.analogy}</blockquote>${l.sections.map(([title, text], i) => `<section class="learn-prose" id="learn-section-${i}" data-reveal><span class="learn-kicker">${number(i + 1)} / РАЗБИРАЕМСЯ</span><h2>${title}</h2><p>${updated(text)}</p></section>`).join('')}<div class="learn-source"><span class="learn-kicker">ГЛУБЖЕ В ТЕМУ</span><a href="${l.source}" target="_blank" rel="noopener">${new URL(l.source).hostname.replace('www.', '')} · первоисточник ↗</a></div><section class="learn-check" data-reveal><span class="learn-kicker">ПРОВЕРЬ ПОНИМАНИЕ</span><h2>${l.q}</h2><div class="learn-options">${l.opts.map((o, i) => `<button class="learn-option" data-answer="${i}"><span>${String.fromCharCode(65 + i)}</span><b>${o}</b><i>↗</i></button>`).join('')}</div><p class="learn-feedback" aria-live="polite">${progress.done.includes(index) ? 'Ты уже ответил на этот вопрос правильно. Можно проверить себя ещё раз.' : 'Верный ответ сохранит прохождение главы.'}</p></section><div class="learn-reader-next"><button class="learn-link" data-action="practice">Попробовать в мире ↗</button><button class="learn-solid" id="learn-next">${index < lessons.length - 1 ? 'Следующая глава →' : 'Итоговый тест →'}</button></div></div></article>`;
    $('#learn-back').onclick = () => changePage('course');
    $$('.learn-option').forEach(b => b.onclick = () => {
      const ok = Number(b.dataset.answer) === l.answer;
      b.classList.add(ok ? 'is-correct' : 'is-wrong');
      $('.learn-feedback').textContent = (ok ? 'Верно. ' : 'Пока не совсем. ') + l.explain;
      if (ok) {
        if (!progress.done.includes(index)) { progress.done.push(index); saveProgress(); }
        $$('.learn-option').forEach(o => o.disabled = true);
      }
    });
    $('#learn-next').onclick = () => index < lessons.length - 1 ? showLesson(index + 1) : changePage('quiz');
    scroll.scrollTop = 0; animate();
  }
  function renderQuiz() {
    if (!quizStarted) {
      pane.innerHTML = `<section class="learn-hero learn-quiz-intro" data-reveal><div class="learn-kicker"><i></i> ПРОВЕРКА СВЯЗИ / 12 ВОПРОСОВ</div><h1>Знания<br><em>на связи?</em></h1><p class="learn-lead">Двенадцать ситуаций. Никакого таймера.<br>После каждого ответа — понятное объяснение.</p><div class="learn-quiz-stat"><span>${number(progress.best)}<small>/ 12</small></span><p>ТВОЙ ЛУЧШИЙ<br>РЕЗУЛЬТАТ</p></div><button class="learn-solid" id="learn-start-quiz">Начать проверку <span>↗</span></button>${orbitArtwork('quiz')}</section>`;
      $('#learn-start-quiz').onclick = () => { quizStarted = true; quizIndex = quizScore = 0; quizAnswers = []; renderQuiz(); animate(); };
      return;
    }
    if (quizIndex >= lessons.length) { renderQuizResult(); return; }
    quizAnswered = quizAnswers[quizIndex] !== undefined; const l = lessons[quizIndex];
    pane.innerHTML = `<section class="learn-quiz-scene"><div class="learn-kicker" data-reveal>ВОПРОС ${number(quizIndex + 1)} / ${number(lessons.length)} <span>· ${l.tag}</span></div><div class="learn-quiz-line">${lessons.map((_, i) => `<i class="${i < quizIndex ? 'is-done' : i === quizIndex ? 'is-now' : ''}"></i>`).join('')}</div><div class="learn-question-number" aria-hidden="true">${number(quizIndex + 1)}</div><h1 data-reveal>${l.q}</h1><div class="learn-options" data-reveal>${l.opts.map((o, i) => `<button class="learn-option" data-answer="${i}"><span>${String.fromCharCode(65 + i)}</span><b>${o}</b><i>↗</i></button>`).join('')}</div><div class="learn-answer-result" aria-live="polite"></div><button class="learn-solid" id="learn-next-question" hidden>${quizIndex === 11 ? 'Мой результат →' : 'Следующий вопрос →'}</button></section>`;
    const revealAnswer = answer => {
      const ok = answer === l.answer;
      const selectedOption = $$('.learn-option').find(o => Number(o.dataset.answer) === answer);
      selectedOption?.classList.add(ok ? 'is-correct' : 'is-wrong');
      $$('.learn-option').forEach(o => { o.disabled = true; if (Number(o.dataset.answer) === l.answer) o.classList.add('is-correct'); });
      $('.learn-answer-result').innerHTML = `<strong>${ok ? 'Соединение установлено.' : 'Разберём этот момент.'}</strong><p>${l.explain}</p>`;
      $('#learn-next-question').hidden = false;
    };
    $$('.learn-option').forEach(b => b.onclick = () => {
      if (quizAnswered) return; quizAnswered = true;
      const answer = Number(b.dataset.answer);
      quizAnswers[quizIndex] = answer;
      quizScore = quizAnswers.reduce((score, answer, index) => score + (answer === lessons[index].answer ? 1 : 0), 0);
      revealAnswer(answer);
    });
    if (quizAnswered) revealAnswer(quizAnswers[quizIndex]);
    $('#learn-next-question').onclick = () => {
      quizIndex++;
      if (quizIndex === lessons.length) { progress.best = Math.max(progress.best, quizScore); saveProgress(); }
      renderQuiz(); scroll.scrollTop = 0; animate();
    };
  }
  function renderQuizResult() {
    pane.innerHTML = `<section class="learn-quiz-finish" data-reveal><div class="learn-kicker">ПРОВЕРКА ЗАВЕРШЕНА</div><div class="learn-score">${number(quizScore)}<span>/ 12</span></div><h1>${quizScore >= 10 ? 'Ты видишь<br>связь.' : 'Каждый ответ —<br>новая связь.'}</h1><p>${quizScore >= 10 ? 'Основные идеи уже сложились в систему. Теперь построй собственную сеть.' : 'Повтори темы, которые вызвали вопросы, и проверь их на практике. Ты можешь пройти тест снова в любое время.'}</p><div class="learn-finish-actions"><button class="learn-solid" data-action="practice">В 3D-лабораторию ↗</button><button class="learn-link" id="learn-retry">Пройти ещё раз ↻</button><button class="learn-link" data-tab="course">Вернуться к главам →</button></div></section>`;
    $('#learn-retry').onclick = () => { quizIndex = quizScore = 0; quizAnswers = []; quizStarted = true; renderQuiz(); animate(); };
  }
  function renderTools() {
    pane.innerHTML = `<section class="learn-tools-hero" data-reveal><div class="learn-kicker"><i></i> ЛАБОРАТОРИЯ ИДЕЙ</div><h1>Проверь.<br>Измени. <em>Пойми.</em></h1><p>Несколько экспериментов, после которых теория обретает форму.</p>${orbitArtwork('tools')}</section><nav class="learn-tool-tabs" aria-label="Эксперименты" data-reveal><button data-tool="subnet">01 / Подсети</button><button data-tool="osi">02 / Слои OSI</button><button data-tool="dns">03 / Путь DNS</button><button data-tool="tcp">04 / TCP</button></nav><div class="learn-tool-stage" data-reveal></div>`;
    $$('.learn-tool-tabs button').forEach(b => b.onclick = () => { toolTab = b.dataset.tool; renderTool(); animate($('.learn-tool-stage')); }); renderTool();
  }
  function renderTool() {
    $$('.learn-tool-tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.tool === toolTab));
    const stage = $('.learn-tool-stage');
    if (toolTab === 'subnet') {
      stage.innerHTML = `<div class="learn-tool-explain"><span class="learn-kicker">ЭКСПЕРИМЕНТ 01</span><h2>У каждого<br>адреса есть<br><em>своя сеть.</em></h2><p>Меняй префикс и наблюдай, как меняется размер подсети. Чем длиннее префикс, тем меньше остаётся битов для адресов устройств.</p><p class="learn-tool-footnote">/31 — два адреса для канала точка-точка. /32 — один адрес. Специальные и зарезервированные диапазоны здесь не проверяются.</p></div><div class="learn-subnet"><form class="learn-cidr-form"><label for="learn-cidr">IPv4-АДРЕС / ПРЕФИКС</label><div><input id="learn-cidr" value="192.168.1.130/26" spellcheck="false" autocomplete="off"><button type="submit" aria-label="Рассчитать подсеть">↗</button></div></form><div class="learn-bits" aria-label="32 бита IPv4"></div><div class="learn-subnet-output" aria-live="polite"></div></div>`;
      $('.learn-cidr-form').onsubmit = e => { e.preventDefault(); calculate(); }; calculate();
    } else if (toolTab === 'osi') {
      stage.innerHTML = `<div class="learn-tool-explain"><span class="learn-kicker">ЭКСПЕРИМЕНТ 02</span><h2>Семь слоёв.<br><em>Один обмен.</em></h2><p>Нажимай на слои, чтобы увидеть их задачи. OSI помогает рассуждать о сети, но не требует, чтобы каждая программа буквально реализовывала семь отдельных блоков.</p><div class="learn-osi-description" aria-live="polite"></div><p class="learn-tool-footnote">Стек TCP/IP обычно описывают четырьмя уровнями. Сопоставление с OSI приблизительное.</p></div><div class="learn-osi-stack">${osi.map(([name], i) => `<button data-layer="${i}" style="--layer:${i}"><span>${7 - i}</span><b>${name}</b><i>↗</i></button>`).join('')}</div>`;
      $$('[data-layer]').forEach(b => b.onclick = () => { const index = Number(b.dataset.layer); $$('[data-layer]').forEach(x => x.classList.toggle('is-active', x === b)); $('.learn-osi-description').innerHTML = `<span class="learn-kicker">УРОВЕНЬ ${7 - index}</span><h3>${osi[index][0]}</h3><p>${osi[index][1]}</p>`; }); $('[data-layer]').click();
    } else if (toolTab === 'dns') {
      const steps = [
        ['Браузер', 'Где живёт example.com?', 'Браузер проверяет локальные кэши. В этом примере нужного ответа нет, поэтому клиент обращается к настроенному рекурсивному резолверу.'],
        ['Резолвер', 'Я найду ответ за тебя.', 'Рекурсивный резолвер тоже не находит ответ в кэше и начинает поиск. Клиенту не нужно самостоятельно спрашивать каждый сервер иерархии.'],
        ['Корень', 'Спроси у серверов зоны .com.', 'Корневой сервер возвращает сведения о серверах доменной зоны .com. Он не хранит IP-адрес каждого сайта.'],
        ['Зона .com', 'Вот серверы example.com.', 'Сервер зоны указывает авторитетные DNS-серверы домена example.com. Это следующий шаг поиска, а не готовый адрес страницы.'],
        ['Авторитетный сервер', 'Ответ найден.', 'Авторитетный сервер возвращает запись для имени. Например, A содержит IPv4-адрес, AAAA — IPv6.'],
        ['Клиент', 'Теперь можно подключаться.', 'Резолвер передаёт ответ клиенту и может сохранить его на время TTL. Далее клиент соединяется с нужным сервисом; DNS сам не загружает страницу.']
      ];
      const renderDNS = () => {
        const [name, title, desc] = steps[dnsStep];
        stage.innerHTML = `<div class="learn-tool-explain"><span class="learn-kicker">ЭКСПЕРИМЕНТ 03 / ШАГ ${dnsStep + 1} ИЗ 6</span><h2>Имя становится<br><em>адресом.</em></h2><p>Пройди упрощённое разрешение имени без готового ответа в кэше.</p><div class="learn-dns-copy"><span class="learn-kicker">${name}</span><h3>${title}</h3><p>${desc}</p></div><div class="learn-dns-actions"><button class="learn-link" id="learn-dns-back" ${dnsStep === 0 ? 'disabled' : ''}>← Назад</button><button class="learn-solid" id="learn-dns-next">${dnsStep === 5 ? 'Сначала ↻' : 'Дальше →'}</button></div></div><div class="learn-dns-network">${steps.map(([n], i) => `<button class="learn-dns-node ${i === dnsStep ? 'is-active' : i < dnsStep ? 'is-done' : ''}" data-dns="${i}"><span>${number(i + 1)}</span><b>${n}</b><i>${i < dnsStep ? '✓' : '•'}</i></button>`).join('')}</div>`;
        $('#learn-dns-next').onclick = () => { dnsStep = (dnsStep + 1) % steps.length; renderDNS(); animate(stage); };
        $('#learn-dns-back').onclick = () => { dnsStep = Math.max(0, dnsStep - 1); renderDNS(); animate(stage); };
        $$('[data-dns]').forEach(b => b.onclick = () => { dnsStep = Number(b.dataset.dns); renderDNS(); animate(stage); });
      }; renderDNS();
    } else {
      let handshake = 0;
      const titles = ['Готов установить соединение?', 'SYN: давай начнём.', 'SYN-ACK: готов, подтверждаю.', 'ACK: подтверждение получено.'];
      const descriptions = ['Клиент и сервер согласуют начальные номера последовательности. Пройди обычное трёхэтапное установление TCP-соединения.', 'Клиент отправляет сегмент с флагом SYN и своим начальным номером последовательности.', 'Сервер подтверждает SYN клиента и сообщает свой начальный номер последовательности в ответе SYN-ACK.', 'Клиент подтверждает SYN сервера. Соединение установлено; теперь возможна передача прикладных данных. TCP сам по себе их не шифрует.'];
      const draw = () => {
        stage.innerHTML = `<div class="learn-tool-explain"><span class="learn-kicker">ЭКСПЕРИМЕНТ 04 / TCP HANDSHAKE</span><h2>Прежде чем<br>говорить —<br><em>договорись.</em></h2><div class="learn-dns-copy"><h3>${titles[handshake]}</h3><p>${descriptions[handshake]}</p></div><button class="learn-solid" id="learn-tcp-next">${handshake === 3 ? 'Повторить ↻' : 'Следующий шаг →'}</button></div><div class="learn-handshake"><div class="learn-handshake-ends"><span>КЛИЕНТ</span><span>СЕРВЕР</span></div>${['SYN →', '← SYN-ACK', 'ACK →'].map((text, i) => `<div class="learn-tcp-arrow ${handshake > i ? 'is-sent' : ''}" style="--step:${i}"><span>${text}</span></div>`).join('')}<p class="learn-mono">${handshake === 3 ? '● СОЕДИНЕНИЕ УСТАНОВЛЕНО' : '○ ОЖИДАНИЕ ПОДТВЕРЖДЕНИЯ'}</p></div>`;
        $('#learn-tcp-next').onclick = () => { handshake = (handshake + 1) % 4; draw(); animate(stage); };
      }; draw();
    }
  }
  function calculate() {
    const result = $('.learn-subnet-output'), bits = $('.learn-bits');
    try {
      const value = $('#learn-cidr').value.trim(), match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value);
      if (!match) throw Error('Введи четыре октета и префикс: например, 192.168.1.10/24.');
      const octets = match.slice(1, 5).map(Number), prefix = Number(match[5]);
      if (octets.some(n => n > 255) || prefix > 32) throw Error('Каждый октет — число от 0 до 255. Префикс — от 0 до 32.');
      const ip = octets.reduce((n, v) => n * 256 + v, 0) >>> 0;
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      const network = (ip & mask) >>> 0, last = (network | (~mask)) >>> 0;
      const format = n => [24, 16, 8, 0].map(shift => (n >>> shift) & 255).join('.');
      const count = prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
      const start = prefix >= 31 ? network : network + 1, end = prefix >= 31 ? last : last - 1;
      const binary = ip.toString(2).padStart(32, '0');
      bits.innerHTML = [...binary].map((v, i) => `<span class="${i < prefix ? 'network-bit' : 'host-bit'}" title="${i < prefix ? 'Бит сети' : 'Бит адреса устройства'}">${v}</span>`).join('');
      result.innerHTML = `<div class="learn-address-count"><strong>${count.toLocaleString('ru')}</strong><span>${prefix === 32 ? 'ОДИН АДРЕС' : 'АДРЕСОВ УСТРОЙСТВ'}</span></div><dl><div><dt>Сеть / префикс</dt><dd>${format(network)}/${prefix}</dd></div><div><dt>Маска</dt><dd>${format(mask)}</dd></div><div><dt>Broadcast</dt><dd>${prefix >= 31 ? 'Не применяется' : format(last)}</dd></div><div><dt>Диапазон устройств</dt><dd>${format(start)}${start === end ? '' : '<br>→ ' + format(end)}</dd></div></dl><div class="learn-bit-legend"><span>● Биты сети: ${prefix}</span><span>● Биты устройства: ${32 - prefix}</span></div>`;
    } catch (e) { result.innerHTML = `<p class="learn-error">${escapeHTML(e.message)}</p>`; bits.innerHTML = ''; }
  }
  updateProgress();
  return {open, openLesson, close, getProgress};
}

